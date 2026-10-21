package com.lnflash.assistant

import android.content.*
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.io.File
import java.util.concurrent.atomic.AtomicLong
import com.lnflash.speech.NeuralRenderer
import com.lnflash.BuildConfig
import com.facebook.react.common.LifecycleState

class SpeechOutputBridgeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val main = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val neuralGeneration = AtomicLong(0)
  private var renderer: NeuralRenderer? = null
  private var track: AudioTrack? = null
  private val pack = SpeechPackStore(context) { state ->
    if (context.hasActiveReactInstance()) {
      val data = Arguments.createMap()
      state.forEach { (key, value) -> when (value) { is String -> data.putString(key, value); is Number -> data.putDouble(key, value.toDouble()) } }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("SpeechPackEvent", data)
    }
  }
  private var sample: MediaPlayer? = null
  private var engine: TextToSpeech? = null
  private var ready = false
  private var current: String? = null
  private var generation = 0
  private var initializing = false
  private val waiting = mutableListOf<(Boolean) -> Unit>()
  private var initDeadline: Runnable? = null
  private var speechDeadline: Runnable? = null
  private var stopDeadline: Runnable? = null
  private val stopWaiters = mutableListOf<Promise>()
  private var focus: AudioFocusRequest? = null
  private var routesRegistered = false
  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesRemoved(devices: Array<out AudioDeviceInfo>) {
      if (devices.any { it.isSink }) stopNow()
    }
  }
  private val memoryCallback = object : ComponentCallbacks2 {
    override fun onConfigurationChanged(configuration: android.content.res.Configuration) {}
    override fun onLowMemory() { main.post { disposeNow() } }
    override fun onTrimMemory(level: Int) {
      if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) main.post { disposeNow() }
    }
  }
  init { context.addLifecycleEventListener(this); context.registerComponentCallbacks(memoryCallback) }
  override fun getName() = "SpeechOutputBridge"
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
  private fun voices(locale: String): List<Voice> {
    val wanted = Locale.forLanguageTag(locale)
    return engine?.voices?.filter {
      !it.isNetworkConnectionRequired &&
      !it.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) &&
      it.locale.language == wanted.language
    }?.sortedWith(compareBy<Voice> { if (it.locale == wanted) 0 else 1 }.thenByDescending { it.quality }.thenBy { it.latency }.thenBy { it.name }).orEmpty()
  }
  private fun voice(locale: String, preferred: String = ""): Voice? {
    val installed = voices(locale)
    return installed.firstOrNull { it.name == preferred } ?: installed.firstOrNull()
  }
  @ReactMethod fun voices(locale: String, promise: Promise) { main.post {
    initialize { ok ->
      try {
        val result = Arguments.createArray()
        if (locale.startsWith("en", true) && pack.installed()) {
          listOf(Triple("af_heart", "Heart", "en-US"), Triple("am_michael", "Michael", "en-US"), Triple("bf_emma", "Emma", "en-GB")).forEach { (id, name, language) -> result.pushMap(Arguments.createMap().apply {
            putString("id", "flash:$id"); putString("name", name); putString("language", language); putInt("quality", 3); putString("source", "pack")
          }) }
        }
        if (ok) voices(locale).forEachIndexed { index, v -> result.pushMap(Arguments.createMap().apply {
          putString("id", v.name); putString("name", "${v.locale.getDisplayName(Locale.getDefault())} ${index + 1}")
          putString("language", v.locale.toLanguageTag()); putInt("quality", if (v.quality >= Voice.QUALITY_VERY_HIGH) 3 else if (v.quality >= Voice.QUALITY_HIGH) 2 else 1)
        }) }
        promise.resolve(result)
      } catch (_: Exception) { promise.resolve(Arguments.createArray()) }
    }
  } }
  private fun initialize(callback: (Boolean) -> Unit) {
    if (ready) { callback(true); return }
    waiting.add(callback)
    if (initializing) return
    initializing = true
    val epoch = ++generation
    fun complete(ok: Boolean) {
      if (generation != epoch || !initializing) return
      initializing = false
      initDeadline?.let { main.removeCallbacks(it) }; initDeadline = null
      ready = ok
      if (!ok) { engine?.shutdown(); engine = null }
      val callbacks = waiting.toList(); waiting.clear()
      callbacks.forEach { it(ok) }
    }
    initDeadline = Runnable { complete(false) }.also { main.postDelayed(it, 4000) }
    try {
      engine = TextToSpeech(context) { status -> main.post { complete(status == TextToSpeech.SUCCESS) } }
    } catch (_: Exception) { complete(false) }
  }
  @ReactMethod fun capability(locale: String, promise: Promise) { main.post {
    initialize { ok ->
      try { promise.resolve((ok && voice(locale) != null) || (locale.startsWith("en", true) && pack.installed())) }
      catch (_: Exception) { promise.resolve(false) }
    }
  } }
  @ReactMethod fun speak(id: String, text: String, locale: String, voiceId: String, rate: Double, promise: Promise) { main.post {
    if (locale.startsWith("en", true) && pack.installed() && (voiceId.isEmpty() || voiceId.startsWith("flash:"))) {
      playNeural(id, text, if (voiceId.isEmpty()) "af_heart" else voiceId.removePrefix("flash:"), rate, promise)
      return@post
    }
    try {
      val native = engine
      val selected = if (ready) voice(locale, voiceId) else null
      if (native == null || selected == null || current != null || text.isBlank() ||
          text.length > minOf(4000, TextToSpeech.getMaxSpeechInputLength()) ||
          !AssistantAudioCoordinator.claim("output:$id")) {
        promise.reject("unavailable", "Offline speech unavailable"); return@post
      }
      current = id
      if (native.setVoice(selected) != TextToSpeech.SUCCESS) throw IllegalStateException()
      if (native.setSpeechRate(rate.coerceIn(0.8, 1.2).toFloat()) != TextToSpeech.SUCCESS) throw IllegalStateException()
      val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change ->
            if (change < 0) main.post { stopNow() }
          }, main).build()
      focus = request
      if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw IllegalStateException()
      native.setAudioAttributes(attributes)
      audio.registerAudioDeviceCallback(deviceCallback, main); routesRegistered = true
      native.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) { main.post { if (current == utteranceId) emit(id, "started") } }
        override fun onDone(utteranceId: String?) { main.post { if (current == utteranceId) finish(id, "end") } }
        @Deprecated("Legacy callback")
        override fun onError(utteranceId: String?) { main.post { if (current == utteranceId) finish(id, "error") } }
        override fun onError(utteranceId: String?, errorCode: Int) { onError(utteranceId) }
        override fun onStop(utteranceId: String?, interrupted: Boolean) { main.post { if (current == utteranceId) finish(id, "end") } }
      })
      if (native.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) throw IllegalStateException()
      speechDeadline = Runnable { if (current == id) stopNow() }.also { main.postDelayed(it, 120000) }
      promise.resolve(null)
    } catch (_: Exception) {
      stopNow(); promise.reject("failed", "Speech failed")
    }
  } }
  @ReactMethod fun packState(promise: Promise) { main.post { promise.resolve(Arguments.makeNativeMap(pack.state())) } }
  @ReactMethod fun downloadPack(source: String, promise: Promise) { main.post { pack.download(source) { promise.resolve(Arguments.makeNativeMap(pack.state())) } } }
  @ReactMethod fun cancelPack(promise: Promise) { main.post { pack.cancel(); promise.resolve(Arguments.makeNativeMap(pack.state())) } }
  @ReactMethod fun removePack(promise: Promise) { main.post {
    stopNow(); renderer?.close(); renderer = null
    try { pack.remove(); promise.resolve(Arguments.makeNativeMap(pack.state())) } catch (_: Exception) { promise.reject("failed", "Could not remove voice pack") }
  } }
  private fun playNeural(id: String, text: String, voice: String, rate: Double, promise: Promise) {
    if (current != null || text.isBlank() || text.length > 4000 || !rate.isFinite() || rate !in 0.8..1.2 || voice !in listOf("af_heart", "am_michael", "bf_emma") || context.lifecycleState != LifecycleState.RESUMED || !AssistantAudioCoordinator.claim("output:$id")) {
      promise.reject("unavailable", "Offline speech unavailable"); return
    }
    current = id
    val epoch = neuralGeneration.incrementAndGet()
    try {
      val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
      val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change -> if (change < 0) main.post { stopNow() } }, main).build()
      focus = focusRequest
      if (audio.requestAudioFocus(focusRequest) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw IllegalStateException()
      val format = AudioFormat.Builder().setSampleRate(24000).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build()
      val player = AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(format).setBufferSizeInBytes(maxOf(24000 * 4 * 2, AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT))).setTransferMode(AudioTrack.MODE_STREAM).build()
      track = player; player.play()
      if (renderer == null) renderer = NeuralRenderer(pack.root.path)
      audio.registerAudioDeviceCallback(deviceCallback, main); routesRegistered = true
      var written = 0L; var started = false
      renderer!!.render(text, voice, rate.toFloat(), object : NeuralRenderer.Listener {
        override fun chunk(pcm: FloatArray, last: Boolean): Boolean {
          if (neuralGeneration.get() != epoch) return false
          var offset = 0
          while (offset < pcm.size) {
            if (neuralGeneration.get() != epoch) return false
            // A whole model chunk may block for seconds while AudioTrack drains.
            // Announce playback after the first small write, not after that wait.
            val n = player.write(pcm, offset, minOf(1024, pcm.size - offset), AudioTrack.WRITE_BLOCKING)
            if (n <= 0) { main.post { if (current == id && track === player) finish(id, "error") }; return false }
            offset += n; written += n
            if (!started) { started = true; main.post { if (current == id && track === player) emit(id, "started") } }
          }
          if (last) {
            val frames = written
            main.post(object : Runnable { override fun run() {
              if (current != id || track !== player) return
              if (player.playbackHeadPosition.toLong() >= frames) finish(id, "end") else main.postDelayed(this, 20)
            } })
          }
          return true
        }
        override fun done(success: Boolean) { if (!success) main.post { if (current == id) finish(id, "error") } }
      })
      speechDeadline = Runnable { if (current == id) stopNow() }.also { main.postDelayed(it, 120000) }
      promise.resolve(null)
    } catch (_: Exception) { finish(id, "error"); promise.reject("failed", "Offline speech failed") }
  }
  @ReactMethod fun playSample(id: String, path: String, promise: Promise) { main.post {
    try {
      val root = File(context.cacheDir, "flash-voice-audition/v1").canonicalPath + File.separator
      val file = File(path).canonicalFile
      if (!BuildConfig.DEBUG || context.lifecycleState != LifecycleState.RESUMED || current != null || !file.path.startsWith(root) || file.extension != "wav" ||
          !file.isFile || file.length() !in 1L..4_999_999L || !AssistantAudioCoordinator.claim("output:$id")) {
        promise.reject("unavailable", "Sample unavailable"); return@post
      }
      current = id
      val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change ->
            if (change < 0) main.post { stopNow() }
          }, main).build()
      focus = request
      if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw IllegalStateException()
      val player = MediaPlayer(); sample = player
      player.setAudioAttributes(attributes)
      player.setDataSource(file.path)
      player.setOnPreparedListener { if (current == id && sample === player) { player.start(); emit(id, "started") } }
      player.setOnCompletionListener { if (current == id && sample === player) finish(id, "end") }
      player.setOnErrorListener { _, _, _ -> if (current == id && sample === player) finish(id, "error"); true }
      audio.registerAudioDeviceCallback(deviceCallback, main); routesRegistered = true
      player.prepareAsync()
      speechDeadline = Runnable { if (current == id) stopNow() }.also { main.postDelayed(it, 60000) }
      promise.resolve(null)
    } catch (_: Exception) { if (current == id) finish(id, "error"); promise.reject("failed", "Sample failed") }
  } }
  private fun emit(id: String, type: String) {
    if (!context.hasActiveReactInstance()) return
    val payload = Arguments.createMap().apply { putString("playbackId", id); putString("type", type) }
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("SpeechOutputEvent", payload)
  }
  private fun finish(id: String, type: String) {
    if (current != id) return
    current = null
    neuralGeneration.incrementAndGet(); renderer?.cancel()
    track?.let { try { it.pause(); it.flush(); it.release() } catch (_: Exception) {} }; track = null
    sample?.release(); sample = null
    stopDeadline?.let { main.removeCallbacks(it) }; stopDeadline = null
    val waiters = stopWaiters.toList(); stopWaiters.clear()
    speechDeadline?.let { main.removeCallbacks(it) }; speechDeadline = null
    focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    if (routesRegistered) { audio.unregisterAudioDeviceCallback(deviceCallback); routesRegistered = false }
    AssistantAudioCoordinator.release("output:$id")
    emit(id, type)
    waiters.forEach { it.resolve(null) }
  }
  private fun stopNow(): Boolean {
    val id = current ?: return true
    if (track != null) { finish(id, "end"); return true }
    if (sample != null) { finish(id, "end"); return true }
    return try {
      if (engine?.stop() == TextToSpeech.ERROR) false else {
        if (engine?.isSpeaking != true) finish(id, "end") else {
          stopDeadline?.let { main.removeCallbacks(it) }
          stopDeadline = Runnable {
            if (current == id) {
              if (engine?.isSpeaking != true) finish(id, "end") else {
                val waiters = stopWaiters.toList(); stopWaiters.clear()
                waiters.forEach { it.reject("stop_timeout", "Speech did not stop") }
                emit(id, "error") // Keep ownership until terminal callback/shutdown.
              }
            }
          }.also { main.postDelayed(it, 750) }
        }
        true
      }
    } catch (_: Exception) { false }
  }
  @ReactMethod fun stop(promise: Promise) { main.post {
    if (current == null) { promise.resolve(null); return@post }
    stopWaiters.add(promise)
    if (!stopNow()) {
      stopWaiters.remove(promise)
      promise.reject("stop_failed", "Speech did not stop")
    }
  } }
  private fun disposeNow() {
    stopNow()
    val old = current
    renderer?.close(); renderer = null
    engine?.shutdown(); engine = null; ready = false
    if (old != null) finish(old, "end")
    generation++; initializing = false
    initDeadline?.let { main.removeCallbacks(it) }; initDeadline = null
    val callbacks = waiting.toList(); waiting.clear(); callbacks.forEach { it(false) }
  }
  @ReactMethod fun dispose() { main.post { disposeNow() } }
  override fun onHostPause() { main.post { pack.cancel(); disposeNow() } }
  override fun onHostDestroy() { main.post { disposeNow() } }
  override fun onHostResume() {}
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    context.unregisterComponentCallbacks(memoryCallback)
    main.post { pack.close() }
    main.post { disposeNow() }
    super.invalidate()
  }
}
