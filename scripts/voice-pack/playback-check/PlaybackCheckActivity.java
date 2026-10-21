package com.lnflash.assistant;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.widget.TextView;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import kotlin.Unit;
import org.json.JSONArray;
import org.json.JSONObject;

/** Isolated, muted real-AudioTrack regression check; no wallet, network or microphone. */
public final class PlaybackCheckActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    TextView view = new TextView(this);
    view.setText("Checking short audio playback…");
    setContentView(view);
    new Thread(() -> {
      JSONObject result = new JSONObject();
      try {
        JSONArray cases = new JSONArray();
        for (int frames : new int[] {1, 33000, 72000}) cases.put(check(frames));
        result.put("api", Build.VERSION.SDK_INT).put("cases", cases).put("passed", true);
      } catch (Exception error) {
        try { result.put("passed", false).put("error", "Playback check failed"); } catch (Exception ignored) { }
      }
      try {
        Files.write(new File(getFilesDir(), "playback-check.json").toPath(),
            result.toString(2).getBytes(StandardCharsets.UTF_8));
      } catch (Exception ignored) { }
      runOnUiThread(() -> view.setText(result.toString()));
    }, "voice-playback-check").start();
  }

  private JSONObject check(int frames) throws Exception {
    AudioTrack track = new AudioTrack.Builder()
        .setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setAudioFormat(new AudioFormat.Builder().setSampleRate(24000)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build())
        .setBufferSizeInBytes(Math.max(48000 * 4,
            AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_FLOAT)))
        .setTransferMode(AudioTrack.MODE_STREAM).build();
    try {
      if (Build.VERSION.SDK_INT >= 31) track.setStartThresholdInFrames(1);
      track.setVolume(0f); // The device still consumes frames, without an audible test tone.
      track.play();
      int[] queued = {0};
      boolean[] failed = {false};
      NeuralPcmWriter writer = new NeuralPcmWriter(
          (pcm, offset, count) -> {
            int n = track.write(pcm, offset, count, AudioTrack.WRITE_BLOCKING);
            if (n > 0) queued[0] += n;
            return n;
          }, () -> true,
          () -> Build.VERSION.SDK_INT >= 31
              ? track.getStartThresholdInFrames() : track.getBufferSizeInFrames(),
          () -> Unit.INSTANCE, () -> { failed[0] = true; return Unit.INSTANCE; });
      float[] pcm = new float[frames];
      for (int i = 0; i < frames; i++) pcm[i] = (float) (0.1 * Math.sin(i * 2 * Math.PI * 440 / 24000));
      long start = SystemClock.elapsedRealtime();
      if (!writer.append(pcm, true) || failed[0] || writer.getAudioFrames() != frames)
        throw new IllegalStateException();
      while (track.getPlaybackHeadPosition() < writer.getAudioFrames()
          && SystemClock.elapsedRealtime() - start < 8000) SystemClock.sleep(10);
      if (track.getPlaybackHeadPosition() < writer.getAudioFrames()) throw new IllegalStateException();
      return new JSONObject().put("audioFrames", frames).put("queuedFrames", queued[0])
          .put("thresholdFrames", Build.VERSION.SDK_INT >= 31
              ? track.getStartThresholdInFrames() : track.getBufferSizeInFrames())
          .put("elapsedMs", SystemClock.elapsedRealtime() - start).put("completed", true);
    } finally {
      track.pause(); track.flush(); track.release();
    }
  }
}
