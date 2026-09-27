import { Platform } from "react-native"
import NfcManager from "react-native-nfc-manager"

/**
 * How long Android waits for the card to answer a single APDU.
 *
 * Android's IsoDep transceive timeout defaults to 618 ms and the NFC stack
 * reports an expiry as `TagLostException` — indistinguishable from the card
 * leaving the field. `SPEND_PROOF` and `SIGN_ARBITRARY` compute a BIP-340
 * signature on-card, and under NFC power that can outlive the default: flash-pos
 * saw every burn on a Pixel die ~0.6 s into the APDU on a card that never
 * moved, and each one still burned its slot, because the applet marks the
 * proof spent before it signs. PIN verification is cheaper but the same
 * budget costs nothing: a card that genuinely leaves the field fails at the
 * RF layer at once. iOS has no equivalent knob (CoreNFC honours the card's
 * own WTX requests) and the library's iOS module has no `setTimeout`.
 */
export const CARD_TRANSCEIVE_TIMEOUT_MS = 5000

/**
 * Raises the transceive timeout for the connected IsoDep tag. Call it once
 * per session, after `requestTechnology` resolves — IsoDep resets it when the
 * tag closes. Best-effort: if the bridge refuses, the session carries on with
 * the platform default rather than failing a card operation over a tuning knob.
 */
export const extendCardTimeout = async (): Promise<void> => {
  if (Platform.OS !== "android") return
  try {
    await NfcManager.setTimeout(CARD_TRANSCEIVE_TIMEOUT_MS)
  } catch (error) {
    console.warn("[cashu-card] could not extend the transceive timeout", String(error))
  }
}
