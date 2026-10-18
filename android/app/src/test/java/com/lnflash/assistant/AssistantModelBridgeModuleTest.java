package com.lnflash.assistant;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;

/**
 * The model's text as the bridge answers it to JS (ENG-690):
 * {@link AssistantModelBridgeModule#callJsonOf}. genai-prompt 1.0.0-beta2 has
 * no schema-constrained output, so Gemini Nano can write anything for
 * {@code args}. Whatever it wrote reaches JS as the JSON it was, where the
 * router refuses an {@code args} that is not an object, as it does iOS's:
 * malformed output gets the miss reply, never a different call with no
 * arguments.
 */
public class AssistantModelBridgeModuleTest {

  private static JSONObject answerOf(String modelText) throws Exception {
    return new JSONObject(AssistantModelBridgeModule.callJsonOf(modelText));
  }

  /** What JS's JSON.parse makes of the bridge's argsJson. */
  private static Object argsOf(JSONObject answer) throws Exception {
    return new JSONTokener(answer.getString("argsJson")).nextValue();
  }

  @Test
  public void passesAnObjectArgsThrough() throws Exception {
    JSONObject answer =
        answerOf(
            "Here is the call: {\"intent\": \"prepareSend\", "
                + "\"args\": {\"payee\": \"bob\", \"amount\": \"5\"}} Done.");

    assertEquals("prepareSend", answer.getString("intent"));
    JSONObject args = (JSONObject) argsOf(answer);
    assertEquals("bob", args.getString("payee"));
    assertEquals("5", args.getString("amount"));
    assertEquals(2, args.length());
  }

  @Test
  public void passesAStringArgsThroughAsAString() throws Exception {
    // beta2's free text once gave {"intent":"prepareReceive","args":"BTC"}:
    // dropping the string made it prepareReceive with no arguments.
    JSONObject answer = answerOf("{\"intent\":\"prepareReceive\",\"args\":\"BTC\"}");

    assertEquals("prepareReceive", answer.getString("intent"));
    assertTrue(answer.has("argsJson"));
    assertEquals("BTC", argsOf(answer));
  }

  @Test
  public void keepsAStringArgsWholeWhateverItHolds() throws Exception {
    JSONObject answer =
        answerOf("{\"intent\":\"prepareSend\",\"args\":\"say \\\"hi\\\" \\\\ {now}\"}");

    assertEquals("say \"hi\" \\ {now}", argsOf(answer));
  }

  @Test
  public void passesANumberAListOrAFlagThroughAsItWas() throws Exception {
    Object number = argsOf(answerOf("{\"intent\":\"prepareSend\",\"args\":5}"));
    assertTrue(number instanceof Number);
    assertEquals(5, ((Number) number).intValue());

    Object list = argsOf(answerOf("{\"intent\":\"prepareSend\",\"args\":[\"bob\",5]}"));
    assertTrue(list instanceof JSONArray);
    assertEquals("bob", ((JSONArray) list).getString(0));
    assertEquals(5, ((JSONArray) list).getInt(1));

    assertEquals(Boolean.TRUE, argsOf(answerOf("{\"intent\":\"getBalances\",\"args\":true}")));
  }

  @Test
  public void readsNoArgsAndNullArgsAsNoArguments() throws Exception {
    JSONObject absent = answerOf("{\"intent\":\"getBalances\"}");
    JSONObject nothing = answerOf("{\"intent\":\"getBalances\",\"args\":null}");

    assertEquals("getBalances", absent.getString("intent"));
    assertFalse(absent.has("argsJson"));
    assertEquals("getBalances", nothing.getString("intent"));
    assertFalse(nothing.has("argsJson"));
  }

  @Test
  public void answersNoneForTextThatIsNoCall() throws Exception {
    String[] notCalls = {
      null,
      "",
      "I can't help with that.",
      "{\"args\": {\"payee\": \"bob\"}}",
      "{\"intent\": 5}",
      "{\"intent\": \"prepareSend\", \"args\": {",
      "} {",
    };
    for (String text : notCalls) {
      assertEquals(String.valueOf(text), AssistantModelBridgeModule.NONE,
          AssistantModelBridgeModule.callJsonOf(text));
    }
  }

  @Test
  public void answersOnlyIntentAndArgsJson() throws Exception {
    JSONObject answer =
        answerOf("{\"intent\":\"getPrice\",\"args\":{},\"note\":\"extra\",\"argsJson\":\"x\"}");

    assertEquals(2, answer.length());
    assertEquals("getPrice", answer.getString("intent"));
    assertEquals(0, ((JSONObject) argsOf(answer)).length());
  }
}
