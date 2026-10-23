package com.lnflash.assistant

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executor

/** Never creates the default recognizer: every session is explicitly on-device. */
class VoiceInputBridgeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val main = Handler(Looper.getMainLooper())
  private var session: String? = null
  private var stopping = false
  private var recognizer: SpeechRecognizer? = null
  private var timeout: Runnable? = null
  private val probes = mutableSetOf<SpeechRecognizer>()

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "VoiceInputBridge"
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  private fun supported() = Build.VERSION.SDK_INT >= 31 &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

  private fun intent(locale: String) = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
  }

  @ReactMethod fun capability(locale: String, promise: Promise) {
    main.post {
      var probe: SpeechRecognizer? = null
      var settled = false
      var deadline: Runnable? = null
      fun complete(available: Boolean) {
        if (settled) return
        settled = true
        deadline?.let { main.removeCallbacks(it) }
        probe?.let {
          probes.remove(it)
          try { it.destroy() } catch (_: Exception) { /* Already released. */ }
        }
        promise.resolve(available)
      }
      try {
        if (!supported()) { complete(false); return@post }
        if (Build.VERSION.SDK_INT < 33) { complete(true); return@post }
        val native = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        probe = native
        probes.add(native)
        // Readiness can be unknown; start still uses only the on-device service.
        deadline = Runnable { complete(true) }.also { main.postDelayed(it, 1500) }
        native.checkRecognitionSupport(intent(locale), Executor { main.post(it) },
            object : RecognitionSupportCallback {
              override fun onSupportResult(support: RecognitionSupport) {
                complete(support.installedOnDeviceLanguages.any {
                  it.replace('_', '-').equals(locale, ignoreCase = true)
                })
              }
              override fun onError(error: Int) {
                // Some services cannot report readiness before microphone permission.
                complete(error != SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED &&
                    error != SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
              }
            })
      } catch (_: Exception) { complete(false) }
    }
  }

  @ReactMethod fun start(id: String, locale: String, contextualStrings: ReadableArray) {
    val hints = (0 until minOf(contextualStrings.size(), 100))
      .mapNotNull { if (contextualStrings.getType(it) == ReadableType.String) contextualStrings.getString(it) else null }
      .filter { it.isNotBlank() && it.length <= 100 }
    main.post {
      if (session != null) { emit(id, "error", "unavailable"); emit(id, "end"); return@post }
      session = id
      stopping = false
      try {
        if (!supported()) { finish("unavailable"); return@post }
        if (!AssistantAudioCoordinator.claim("input:$id")) { finish("unavailable"); return@post }
        val native = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        recognizer = native
        native.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) { if (session == id) emit(id, "started") }
          override fun onPartialResults(results: Bundle?) {
            if (session == id) emit(id, "interim", transcript(results))
          }
          override fun onResults(results: Bundle?) {
            if (session != id) return
            emit(id, "final", transcript(results))
            finish()
          }
          override fun onError(error: Int) {
            if (session != id) return
            val code = when (error) {
              SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
              SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
              SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "unavailable"
              SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
              else -> "failure"
            }
            finish(code)
          }
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {} // A final result/error must still arrive.
          override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val captureIntent = intent(locale).apply {
          if (Build.VERSION.SDK_INT >= 33) {
            putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, ArrayList(hints))
          }
        }
        native.startListening(captureIntent)
        scheduleTimeout(id, 60000)
      } catch (_: Exception) { finish("failure") }
    }
  }

  @ReactMethod fun stop(id: String) {
    main.post {
      if (session != id || stopping) return@post
      stopping = true
      try { recognizer?.stopListening(); scheduleTimeout(id, 5000) }
      catch (_: Exception) { finish("failure") }
    }
  }
  @ReactMethod fun abort(id: String) { main.post { if (session == id) finish("interrupted") } }

  private fun transcript(results: Bundle?) =
      results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

  private fun emit(id: String, type: String, text: String? = null) {
    if (!context.hasActiveReactInstance()) return
    val payload = Arguments.createMap().apply {
      putString("sessionId", id)
      putString("type", type)
      if (text != null) putString("text", text)
    }
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("VoiceInputEvent", payload)
  }
  private fun scheduleTimeout(id: String, ms: Long) {
    timeout?.let { main.removeCallbacks(it) }
    timeout = Runnable { if (session == id) finish("failure") }.also { main.postDelayed(it, ms) }
  }
  private fun finish(error: String? = null) {
    val id = session ?: return
    session = null
    timeout?.let { main.removeCallbacks(it) }
    timeout = null
    val native = recognizer
    recognizer = null
    try { native?.cancel() } catch (_: Exception) { /* Continue releasing resources. */ }
    try { native?.destroy() } catch (_: Exception) { /* Already destroyed by the service. */ }
    AssistantAudioCoordinator.release("input:$id")
    if (error != null) emit(id, "error", error)
    emit(id, "end")
  }
  override fun onHostPause() { main.post { finish("interrupted") } }
  override fun onHostDestroy() { main.post { finish("interrupted") } }
  override fun onHostResume() {}
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    main.post {
      finish("interrupted")
      probes.forEach { it.destroy() }
      probes.clear()
    }
    super.invalidate()
  }
}
