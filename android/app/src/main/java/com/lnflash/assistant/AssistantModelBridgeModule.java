package com.lnflash.assistant;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.VisibleForTesting;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * The Flash assistant's on-device model on Android (ENG-690): ML Kit's GenAI
 * Prompt API over Gemini Nano, which AICore runs on the devices it supports.
 * The JS layer (app/assistant/engine/native-model-bridge.ts) asks
 * {@link #isAvailable} on every turn the grammar tier cannot read, then
 * {@link #complete} for at most one tool call, which JS validates before
 * anything runs.
 *
 * <ul>
 *   <li>Only a model AICore reports AVAILABLE counts. DOWNLOADABLE and
 *       DOWNLOADING are unavailable, and nothing here ever starts a download
 *       (architect decision 7): AICore fetches the model, never Flash.</li>
 *   <li>Nothing here throws into JS. Every failure resolves
 *       {"intent":"none"} or rejects with a code; JS reads any rejection as
 *       no model, and the turn answers as it does without one.</li>
 * </ul>
 *
 * Java, not Kotlin like the widget bridge: genai-prompt's classes carry
 * Kotlin 2.2 metadata, which this app's Kotlin 2.0 compiler refuses to read.
 * javac reads only the bytecode, through the futures API ML Kit ships for
 * Java callers.
 */
public final class AssistantModelBridgeModule extends ReactContextBaseJavaModule {

  static final String NAME = "AssistantModelBridge";

  /** AICore answers a status check locally; a slower one counts as unavailable. */
  private static final long STATUS_TIMEOUT_MS = 1000;

  /** A call is one short JSON object; this leaves room for a long memo. */
  private static final int MAX_OUTPUT_TOKENS = 256;

  @VisibleForTesting
  static final String NONE = "{\"intent\":\"none\"}";

  /**
   * genai-prompt 1.0.0-beta2 has no schema-constrained output, so the shape
   * is asked for in words and read back by {@link #callJsonOf}.
   */
  private static final String OUTPUT_FORMAT =
      "Answer with one JSON object and nothing else: "
          + "{\"intent\": \"<one intent from the list, or none>\", "
          + "\"args\": {<that intent's arguments>}}";

  /** Every model call runs here, one at a time, off the JS thread. */
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  /** Made on the worker the first time it is needed; null where ML Kit cannot make one. */
  @Nullable private volatile GenerativeModelFutures model;

  private boolean modelTried;

  public AssistantModelBridgeModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  /** Whether Gemini Nano can answer now. Resolves false on any failure; never rejects. */
  @ReactMethod
  public void isAvailable(Promise promise) {
    try {
      worker.execute(() -> promise.resolve(readyModel() != null));
    } catch (Throwable t) {
      promise.resolve(false);
    }
  }

  /**
   * One tool call for the prompt, as {"intent": "...", "argsJson": "..."}.
   * {@code promptJson} is a ModelPrompt (app/assistant/engine/model-prompt.ts):
   * Gemini Nano reads its {@code instructions} and {@code prompt}; its
   * {@code tools} shape iOS's guided answer and are not needed here. The
   * model gets {@code timeoutMs}; past it the call is cancelled and rejects
   * "timeout".
   */
  @ReactMethod
  public void complete(String promptJson, double timeoutMs, Promise promise) {
    try {
      worker.execute(() -> run(promptJson, (long) Math.max(0, timeoutMs), promise));
    } catch (Throwable t) {
      promise.reject("unavailable", "The on-device model cannot take a request");
    }
  }

  private void run(String promptJson, long timeoutMs, Promise promise) {
    ListenableFuture<GenerateContentResponse> pending = null;
    try {
      GenerativeModelFutures ready = readyModel();
      if (ready == null) {
        promise.reject("unavailable", "No on-device model is available");
        return;
      }
      JSONObject parts = new JSONObject(promptJson);
      String text =
          parts.getString("instructions") + "\n\n" + OUTPUT_FORMAT + "\n\n"
              + parts.getString("prompt");
      GenerateContentRequest.Builder builder = new GenerateContentRequest.Builder(new TextPart(text));
      builder.setTemperature(0f);
      builder.setTopK(1);
      builder.setCandidateCount(1);
      builder.setMaxOutputTokens(MAX_OUTPUT_TOKENS);
      pending = ready.generateContent(builder.build());
      GenerateContentResponse response = pending.get(timeoutMs, TimeUnit.MILLISECONDS);
      promise.resolve(callJsonOf(firstText(response)));
    } catch (TimeoutException e) {
      if (pending != null) pending.cancel(true);
      promise.reject("timeout", "The on-device model did not answer in time");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      promise.reject("generation_failed", "The on-device model was interrupted");
    } catch (Throwable t) {
      promise.reject("generation_failed", "The on-device model failed");
    }
  }

  /** The client, when AICore reports the model AVAILABLE; null otherwise. Worker thread only. */
  @Nullable
  private GenerativeModelFutures readyModel() {
    try {
      if (!modelTried) {
        modelTried = true;
        model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
      }
      if (model == null) return null;
      Integer status = model.checkStatus().get(STATUS_TIMEOUT_MS, TimeUnit.MILLISECONDS);
      return status != null && status == FeatureStatus.AVAILABLE ? model : null;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return null;
    } catch (Throwable t) {
      return null;
    }
  }

  @Nullable
  private static String firstText(@Nullable GenerateContentResponse response) {
    if (response == null) return null;
    List<Candidate> candidates = response.getCandidates();
    if (candidates == null || candidates.isEmpty()) return null;
    return candidates.get(0).getText();
  }

  /**
   * The model's text as the bridge's answer: the first JSON object in it,
   * its {@code intent} and its {@code args} re-serialised as {@code argsJson}.
   * Text with no readable object, or an object with no string intent, is
   * none. JS checks the call itself: the intent, the arguments, the grounding.
   */
  @VisibleForTesting
  static String callJsonOf(@Nullable String text) {
    if (text == null) return NONE;
    int start = text.indexOf('{');
    int end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return NONE;
    try {
      JSONObject parsed = new JSONObject(text.substring(start, end + 1));
      Object intent = parsed.opt("intent");
      if (!(intent instanceof String)) return NONE;
      JSONObject answer = new JSONObject().put("intent", intent);
      JSONObject args = parsed.optJSONObject("args");
      if (args != null) answer.put("argsJson", args.toString());
      return answer.toString();
    } catch (Throwable t) {
      return NONE;
    }
  }

  @Override
  public void invalidate() {
    // No new work, and whatever runs is interrupted; the client goes with it.
    worker.shutdownNow();
    GenerativeModelFutures current = model;
    try {
      if (current != null) current.getGenerativeModel().close();
    } catch (Throwable t) {
      // Closing is best effort: the bridge is being torn down.
    }
    super.invalidate();
  }
}
