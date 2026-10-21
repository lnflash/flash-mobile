package com.lnflash.assistant

import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Exercises the production streaming/hash/atomic-install path without Android or JNI. */
class SpeechPackStoreTest {
  private lateinit var base: File
  private lateinit var server: ServerSocket
  private val serverWorkers = Executors.newCachedThreadPool()
  private val worker = Executors.newSingleThreadExecutor()
  private val main = LinkedBlockingQueue<() -> Unit>()
  private val first = "a tiny neural model fixture".toByteArray()
  private val second = "a tiny voice fixture".toByteArray()
  private val files get() = linkedMapOf("model.onnx" to first, "voice.bin" to second)
  private lateinit var store: SpeechPackStore
  private var response: (String, Int) -> Pair<ByteArray, Long> = { name, _ ->
    val bytes = files.getValue(name)
    bytes to bytes.size.toLong()
  }
  private val requests = AtomicInteger()
  private val updates = mutableListOf<Map<String, Any>>()
  private val source get() = "http://127.0.0.1:${server.localPort}/pack"

  @Before fun setup() {
    base = Files.createTempDirectory("speech-pack-test").toFile()
    server = ServerSocket(0, 20, InetAddress.getByName("127.0.0.1"))
    serverWorkers.execute {
      try {
        while (!server.isClosed) {
          val socket = server.accept()
          serverWorkers.execute request@{
            socket.use {
              try {
                val input = it.getInputStream().bufferedReader()
                val request = input.readLine() ?: return@request
                while (!input.readLine().isNullOrEmpty()) { /* Consume request headers. */ }
                val name = request.split(" ")[1].substringAfterLast('/')
                val (bytes, length) = response(name, requests.incrementAndGet())
                val output = it.getOutputStream()
                val headers = if (length == 0L) "Transfer-Encoding: chunked" else "Content-Length: $length"
                output.write("HTTP/1.1 200 OK\r\n$headers\r\nConnection: close\r\n\r\n".toByteArray())
                if (length == 0L) output.write("${bytes.size.toString(16)}\r\n".toByteArray())
                output.write(bytes)
                if (length == 0L) output.write("\r\n0\r\n\r\n".toByteArray())
                output.flush()
              } catch (_: java.io.IOException) { /* Cancellation may close the peer socket. */ }
            }
          }
        }
      } catch (_: SocketException) { /* Server closed by test cleanup. */ }
    }
    store = SpeechPackStore(base, { files.map { (name, bytes) ->
      SpeechPackStore.Asset(name, bytes.size.toLong(), sha(bytes))
    } }, { OkHttpClient.Builder().readTimeout(2, TimeUnit.SECONDS).build() }, { it.execute() },
      { main.add(it) }, worker, true, { updates.add(it) })
    settleWorker()
  }
  @After fun cleanup() {
    store.close()
    worker.awaitTermination(5, TimeUnit.SECONDS)
    server.close()
    serverWorkers.shutdownNow()
    base.deleteRecursively()
  }
  private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }
  private fun settleWorker() { worker.submit {}.get(5, TimeUnit.SECONDS) }
  private fun pumpUntil(condition: () -> Boolean) {
    val end = System.nanoTime() + TimeUnit.SECONDS.toNanos(8)
    while (!condition() && System.nanoTime() < end) main.poll(50, TimeUnit.MILLISECONDS)?.invoke()
    assertTrue("Timed out waiting for native completion", condition())
    while (true) (main.poll() ?: break).invoke()
    settleWorker()
  }
  private fun assertClean() {
    settleWorker()
    assertFalse(base.listFiles().orEmpty().any { it.name.startsWith("staging-") })
  }
  private fun attempt(): Boolean {
    var result: Boolean? = null
    store.download(source) { result = it }
    pumpUntil { result != null }
    return result!!
  }
  @Test fun verifiesEveryAssetThenAtomicallyInstallsAndReusesWithoutNetworking() {
    assertFalse(store.installed())
    assertTrue(attempt())
    assertTrue(store.installed())
    assertEquals("ready", store.state()["phase"])
    assertEquals(SpeechPackStore.VERSION, File(store.root, "ready").readText())
    files.forEach { (name, bytes) -> assertArrayEquals(bytes, File(store.root, name).readBytes()) }
    assertEquals(2, requests.get())
    assertTrue(attempt())
    assertEquals(2, requests.get())
    assertClean()
    store.remove()
    assertFalse(store.installed())
    assertEquals("missing", store.state()["phase"])
  }
  @Test fun rejectsSameSizeCorruptionWithoutExposingPartialInstall() {
    response = { name, _ -> val bytes = files.getValue(name).clone(); bytes[0] = 0; bytes to bytes.size.toLong() }
    assertFalse(attempt())
    assertFalse(store.installed())
    assertEquals("failed", store.state()["phase"])
    assertFalse(store.root.exists())
    assertClean()
  }
  @Test fun rejectsIncorrectContentLengthBeforeInstalling() {
    response = { name, _ -> val bytes = files.getValue(name) + 1.toByte(); bytes to bytes.size.toLong() }
    assertFalse(attempt())
    assertFalse(store.root.exists())
    assertClean()
  }
  @Test fun rejectsTruncatedChunkedBodyAfterAnEarlierValidAsset() {
    response = { name, _ ->
      val bytes = files.getValue(name)
      if (name == "voice.bin") bytes.copyOf(bytes.size - 1) to 0L else bytes to bytes.size.toLong()
    }
    assertFalse(attempt())
    assertEquals(2, requests.get())
    assertFalse(store.root.exists())
    assertClean()
  }
  @Test fun rejectsOversizedChunkedBodyInsteadOfTrustingMissingContentLength() {
    response = { name, _ -> (files.getValue(name) + ByteArray(1024)) to 0L }
    assertFalse(attempt())
    assertFalse(store.root.exists())
    assertClean()
  }
  @Test fun cancellationAndImmediateRetryIgnoreQueuedProgressAndSuccessfulOldCommit() {
    var firstResult: Boolean? = null
    var retryResult: Boolean? = null
    store.download(source) { firstResult = it }
    settleWorker() // Old worker has verified all bytes; its commit is still queued on main.
    assertTrue(main.isNotEmpty())
    assertFalse(store.installed())
    store.cancel()
    assertEquals(false, firstResult)
    assertEquals("missing", store.state()["phase"])
    store.download(source) { retryResult = it }
    pumpUntil { retryResult != null }
    assertEquals(true, retryResult)
    assertTrue(store.installed())
    assertEquals("ready", store.state()["phase"])
    assertClean()
  }
  @Test fun nativeBackgroundCancellationAbortsActiveTransferAndAllowsImmediateRetry() {
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)
    response = { name, number ->
      if (number == 1) { entered.countDown(); release.await(5, TimeUnit.SECONDS) }
      val bytes = files.getValue(name); bytes to bytes.size.toLong()
    }
    var canceled: Boolean? = null
    var retry: Boolean? = null
    store.download(source) { canceled = it }
    assertTrue(entered.await(5, TimeUnit.SECONDS))
    store.cancel() // Same method used by the module's onHostPause callback.
    assertEquals(false, canceled)
    store.download(source) { retry = it }
    release.countDown()
    pumpUntil { retry != null }
    assertEquals(true, retry)
    assertTrue(store.installed())
    assertClean()
  }
  @Test fun constructionDoesNotLoadTheManifestOrNativeEngine() {
    val lazyWorker = Executors.newSingleThreadExecutor()
    var loads = 0
    var clients = 0
    val lazyBase = File(base, "lazy")
    val lazyStore = SpeechPackStore(lazyBase, {
      loads += 1
      files.map { (name, bytes) -> SpeechPackStore.Asset(name, bytes.size.toLong(), sha(bytes)) }
    }, { clients += 1; OkHttpClient() }, { it.execute() }, { main.add(it) }, lazyWorker, true, {})
    try {
      lazyWorker.submit {}.get(5, TimeUnit.SECONDS)
      assertEquals(0, loads)
      assertEquals(0, clients)
      lazyStore.state()
      assertEquals(1, loads)
      lazyStore.state()
      assertEquals(1, loads)
      assertEquals(0, clients)
    } finally { lazyStore.close(); lazyWorker.awaitTermination(5, TimeUnit.SECONDS) }
  }
  @Test fun initializationCleansAbandonedStagingWithoutRemovingInstalledPack() {
    assertTrue(attempt())
    store.close()
    worker.awaitTermination(5, TimeUnit.SECONDS)
    val stale = File(base, "staging-old").apply { mkdirs() }
    File(stale, "partial").writeText("partial")
    val replacementWorker = Executors.newSingleThreadExecutor()
    store = SpeechPackStore(base, { files.map { (name, bytes) ->
      SpeechPackStore.Asset(name, bytes.size.toLong(), sha(bytes))
    } }, { OkHttpClient() }, { it.execute() }, { main.add(it) }, replacementWorker, true, {})
    try {
      replacementWorker.submit {}.get(5, TimeUnit.SECONDS)
      assertFalse(stale.exists())
      assertTrue(store.installed())
      files.forEach { (name, bytes) -> assertArrayEquals(bytes, File(store.root, name).readBytes()) }
      var reused = false
      store.download(source) { reused = it }
      assertTrue(reused)
      assertEquals(2, requests.get())
    } finally { store.close(); replacementWorker.awaitTermination(5, TimeUnit.SECONDS) }
  }
}
