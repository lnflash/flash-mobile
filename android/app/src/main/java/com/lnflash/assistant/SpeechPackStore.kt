package com.lnflash.assistant

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.facebook.react.modules.network.OkHttpClientProvider
import com.lnflash.BuildConfig
import com.lnflash.speech.NeuralRenderer
import okhttp3.OkHttpClient
import okhttp3.Call
import okhttp3.Response
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Native streaming installation; model bytes never cross the JS bridge. */
class SpeechPackStore internal constructor(
  val base: File,
  assetProvider: () -> List<Asset>,
  clientProvider: () -> OkHttpClient,
  // Keep production Firebase instrumentation at the boundary; JVM tests use real OkHttp directly.
  private val execute: (Call) -> Response,
  private val dispatch: (() -> Unit) -> Unit,
  private val worker: ExecutorService,
  private val allowHttp: Boolean,
  private val update: (Map<String, Any>) -> Unit,
) {
  constructor(context: Context, update: (Map<String, Any>) -> Unit) : this(
    File(context.noBackupFilesDir, "flash-voices"),
    { assets },
    { OkHttpClientProvider.getOkHttpClient().newBuilder()
      .connectTimeout(10, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
      .callTimeout(15, TimeUnit.MINUTES).followRedirects(false).build() },
    { it.execute() },
    mainDispatcher(),
    Executors.newSingleThreadExecutor(),
    BuildConfig.DEBUG,
    update,
  )
  data class Asset(val name: String, val bytes: Long, val sha: String)
  companion object {
    private fun mainDispatcher(): (() -> Unit) -> Unit {
      val handler = Handler(Looper.getMainLooper())
      return { work -> handler.post { work() }; Unit }
    }
    const val VERSION = "kokoro-en-v1"
    val assets: List<Asset> by lazy {
      val array = JSONObject(NeuralRenderer.packManifest()).getJSONArray("files")
      (0 until array.length()).map { i -> val entry = array.getJSONObject(i); Asset(entry.getString("name"), entry.getLong("bytes"), entry.getString("sha256")) }
    }
    val total: Long get() = assets.sumOf { it.bytes }
  }
  private val client: OkHttpClient by lazy(clientProvider)
  private val packAssets: List<Asset> by lazy(assetProvider)
  private val packTotal: Long get() = packAssets.sumOf { it.bytes }
  val root = File(base, VERSION)
  init {
    // Capture old paths before callers can create a new staging directory.
    val stale = base.listFiles()?.filter { it.name.startsWith("staging-") }
    worker.execute { stale?.forEach { it.deleteRecursively() } }
  }
  private var run: String? = null
  private var staging: File? = null
  private var completion: ((Boolean) -> Unit)? = null
  @Volatile private var call: Call? = null
  private var cancellation: AtomicBoolean? = null
  private var received = 0L
  private var failed = false
  fun installed(): Boolean = File(root, "ready").isFile && packAssets.all { File(root, it.name).let { file -> file.isFile && file.length() == it.bytes } }
  fun state(): Map<String, Any> { val ready = installed(); return mapOf("phase" to if (run != null) "downloading" else if (ready) "ready" else if (failed) "failed" else "missing", "receivedBytes" to if (run != null) received.toDouble() else if (ready) packTotal.toDouble() else 0.0, "totalBytes" to packTotal.toDouble()) }
  private fun publish() { update(state()) }
  fun download(source: String, done: (Boolean) -> Unit) {
    if (run != null) { done(false); return }
    if (installed()) { done(true); return }
    val uri = try { URI(source) } catch (_: Exception) { null }
    if (uri?.host == null || uri.userInfo != null || uri.query != null || uri.fragment != null || (uri.scheme != "https" && !(allowHttp && uri.scheme == "http"))) { failed = true; publish(); done(false); return }
    base.mkdirs()
    if (base.usableSpace < packTotal * 2) { failed = true; publish(); done(false); return }
    val id = UUID.randomUUID().toString(); val temporary = File(base, "staging-$id")
    temporary.mkdirs(); run = id; staging = temporary; completion = done; val canceled = AtomicBoolean(false); cancellation = canceled; failed = false; received = 0
    publish()
    worker.execute {
      try {
        var completed = 0L
        for (asset in packAssets) {
          if (canceled.get()) throw IllegalStateException()
          val request = Request.Builder().url(source.trimEnd('/') + "/" + asset.name).build()
          val transfer = client.newCall(request); call = transfer
          if (canceled.get()) { transfer.cancel(); throw IllegalStateException() }
          execute(transfer).use { response ->
            val body = response.body ?: throw IllegalStateException()
            if (response.code != 200 || (body.contentLength() >= 0 && body.contentLength() != asset.bytes)) throw IllegalStateException()
            val digest = MessageDigest.getInstance("SHA-256"); var written = 0L; var lastProgress = 0L
            body.byteStream().use { input -> File(temporary, asset.name).outputStream().use { output ->
              val buffer = ByteArray(256 * 1024)
              while (true) {
                if (canceled.get()) throw IllegalStateException()
                val n = input.read(buffer); if (n < 0) break
                written += n; if (written > asset.bytes) throw IllegalStateException()
                digest.update(buffer, 0, n); output.write(buffer, 0, n)
                val now = System.currentTimeMillis()
                if (now - lastProgress > 100) { lastProgress = now; val progress = completed + written; dispatch { if (run == id) { received = progress; publish() } } }
              }
            } }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            if (written != asset.bytes || hash != asset.sha) throw IllegalStateException()
          }
          call = null; completed += asset.bytes
        }
        File(temporary, "ready").writeText(VERSION)
        dispatch {
          if (run != id) { temporary.deleteRecursively(); return@dispatch }
          root.deleteRecursively()
          if (!temporary.renameTo(root)) { finish(false); return@dispatch }
          finish(true)
        }
      } catch (_: Exception) { temporary.deleteRecursively(); dispatch { if (run == id) finish(false) } }
    }
  }
  fun cancel() { if (run == null) return; cancellation?.set(true); call?.cancel(); finish(false, true) }
  fun remove() { cancel(); if (root.exists() && !root.deleteRecursively()) throw IllegalStateException(); failed = false; publish() }
  private fun finish(ok: Boolean, wasCanceled: Boolean = false) {
    val done = completion; val temporary = staging
    run = null; completion = null; staging = null; received = if (ok) packTotal else 0; failed = !ok && !wasCanceled
    if (!ok) call?.cancel(); call = null
    if (temporary != null) worker.execute { temporary.deleteRecursively() }
    publish(); done?.invoke(ok)
  }
  fun close() { cancel(); worker.shutdown() }
}
