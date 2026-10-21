package com.lnflash.speech;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
/** Lazy worker-bound engine. No inference or model parsing on the main/UI thread. */
public final class NeuralRenderer implements AutoCloseable {
  static { System.loadLibrary("onnxruntime"); System.loadLibrary("flashspeech"); }
  public interface Listener { boolean chunk(float[] pcm, boolean last); void done(boolean success); }
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final String root;
  private long handle, generation;
  private boolean closed;
  public NeuralRenderer(String root) { this.root = root; }
  public synchronized void cancel() { generation++; if (handle != 0) nativeCancel(handle); }
  public void render(String text, String voice, float rate, Listener listener) {
    final long epoch;
    synchronized(this) { if (closed) return; epoch = ++generation; }
    worker.execute(() -> {
      try {
        long engine;
        synchronized(this) { if (closed || generation != epoch) return; engine = handle; }
        if (engine == 0) {
          engine = nativeCreate(root);
          synchronized(this) { if (closed || generation != epoch) { nativeDestroy(engine); return; } handle = engine; }
        }
        nativeRender(engine, text, voice, rate, new Listener() {
          @Override public boolean chunk(float[] pcm, boolean last) {
            synchronized(NeuralRenderer.this) { if (closed || generation != epoch) return false; }
            return listener.chunk(pcm, last);
          }
          @Override public void done(boolean success) { }
        });
        synchronized(this) { if (closed || generation != epoch) return; }
        listener.done(true);
      } catch (RuntimeException e) {
        synchronized(this) { if (closed || generation != epoch) return; }
        listener.done(false);
      }
    });
  }
  @Override public void close() {
    synchronized(this) { if (closed) return; closed = true; cancel(); }
    worker.execute(() -> { synchronized(this) { if (handle != 0) { nativeDestroy(handle); handle = 0; } } });
    worker.shutdown();
  }
  public static native String packManifest();
  private static native long nativeCreate(String root);
  private static native void nativeDestroy(long handle);
  private static native void nativeCancel(long handle);
  private static native void nativeRender(long handle, String text, String voice, float rate, Listener listener);
}
