/**
 * useCashuCard.ts
 *
 * React hook for IsoDep (APDU) NFC sessions with the Cashu JavaCard applet.
 * Manages NFC technology lifecycle — always call cleanup() when done.
 *
 * Usage:
 *   const card = useCashuCard();
 *   await card.startSession();       // request IsoDep technology
 *   const info = await card.getInfo();
 *   const pubkey = await card.getPubkey();
 *   await card.setPin(pin);
 *   await card.verifyPin(pin);
 *   await card.loadProof(keysetId, amount, nonce, C);
 *   await card.cleanup();            // always call on finish or error
 */

import {useCallback, useRef} from 'react';
import NfcManager, {NfcTech} from 'react-native-nfc-manager';

import {
  buildSelectAid,
  buildGetInfo,
  buildGetPubkey,
  buildGetBalance,
  buildGetSlotStatus,
  buildGetProof,
  buildLoadProof,
  buildVerifyPin,
  buildSetPin,
  parseCardInfo,
  parsePubkey,
  parseProof,
  parseBalance,
  getSW,
  getResponseData,
  pinStringToBytes,
  CardInfo,
  CardProof,
  SW_OK,
  CASHU_CLA,
  INS_SPEND_PROOF,
} from './cashu-apdu';

export class CashuCardError extends Error {
  constructor(
    message: string,
    public readonly sw?: number,
  ) {
    super(message);
    this.name = 'CashuCardError';
  }
}

const useCashuCard = () => {
  const sessionActive = useRef(false);

  // ─── Low-level transceive ───────────────────────────────────────────────

  const send = useCallback(async (apdu: number[]): Promise<number[]> => {
    const response = await NfcManager.isoDepHandler.transceive(apdu);
    const arr: number[] = [];
    for (let i = 0; i < response.length; i++) arr.push(response[i]);
    return arr;
  }, []);

  const sendAndCheck = useCallback(
    async (apdu: number[], errorLabel: string): Promise<number[]> => {
      const raw = await send(apdu);
      const sw = getSW(raw);
      if (sw !== SW_OK) {
        throw new CashuCardError(
          `${errorLabel} failed (SW: 0x${sw.toString(16).toUpperCase()})`,
          sw,
        );
      }
      return getResponseData(raw);
    },
    [send],
  );

  // ─── Session lifecycle ──────────────────────────────────────────────────

  const startSession = useCallback(async (): Promise<void> => {
    await NfcManager.requestTechnology(NfcTech.IsoDep);
    sessionActive.current = true;

    // SELECT AID
    await sendAndCheck(buildSelectAid(), 'SELECT AID');
  }, [sendAndCheck]);

  const cleanup = useCallback(async (): Promise<void> => {
    if (sessionActive.current) {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // Ignore — card may have been removed
      }
      sessionActive.current = false;
    }
  }, []);

  // ─── Read commands ──────────────────────────────────────────────────────

  const getInfo = useCallback(async (): Promise<CardInfo> => {
    const data = await sendAndCheck(buildGetInfo(), 'GET_INFO');
    return parseCardInfo(data);
  }, [sendAndCheck]);

  const getPubkey = useCallback(async (): Promise<string> => {
    const data = await sendAndCheck(buildGetPubkey(), 'GET_PUBKEY');
    return parsePubkey(data);
  }, [sendAndCheck]);

  const getBalance = useCallback(async (): Promise<number> => {
    const data = await sendAndCheck(buildGetBalance(), 'GET_BALANCE');
    return parseBalance(data);
  }, [sendAndCheck]);

  const getSlotStatuses = useCallback(async (): Promise<number[]> => {
    const data = await sendAndCheck(buildGetSlotStatus(), 'GET_SLOT_STATUS');
    return data;
  }, [sendAndCheck]);

  const getProof = useCallback(
    async (slotIndex: number): Promise<CardProof> => {
      const data = await sendAndCheck(buildGetProof(slotIndex), 'GET_PROOF');
      return parseProof(data, slotIndex);
    },
    [sendAndCheck],
  );

  // ─── Auth commands ──────────────────────────────────────────────────────

  /** SET_PIN — first-time only, no prior auth required */
  const setPin = useCallback(
    async (pin: string): Promise<void> => {
      await sendAndCheck(buildSetPin(pinStringToBytes(pin)), 'SET_PIN');
    },
    [sendAndCheck],
  );

  /** VERIFY_PIN — establishes write session for LOAD_PROOF / CLEAR_SPENT */
  const verifyPin = useCallback(
    async (pin: string): Promise<void> => {
      await sendAndCheck(buildVerifyPin(pinStringToBytes(pin)), 'VERIFY_PIN');
    },
    [sendAndCheck],
  );

  // ─── Write commands ─────────────────────────────────────────────────────

  /**
   * LOAD_PROOF — write one proof to the card.
   * Requires verifyPin() to have been called in this session.
   *
   * @param keysetIdHex  16-char hex (8 bytes)
   * @param amount       denomination in keyset's base unit
   * @param nonceHex     64-char hex (32-byte nonce from P2PK secret)
   * @param cHex         66-char hex (33-byte compressed C point)
   * @returns slot index written
   */
  const loadProof = useCallback(
    async (
      keysetIdHex: string,
      amount: number,
      nonceHex: string,
      cHex: string,
    ): Promise<number> => {
      const data = await sendAndCheck(
        buildLoadProof(keysetIdHex, amount, nonceHex, cHex),
        'LOAD_PROOF',
      );
      return data[0]; // slot index
    },
    [sendAndCheck],
  );

  // ─── Spend commands ─────────────────────────────────────────────────────

  /**
   * SPEND_PROOF — atomically marks the proof spent and returns a 64-byte
   * BIP-340 Schnorr signature over the provided 32-byte message.
   *
   * msg = SHA256(reconstructP2PKSecret(proof.nonce, cardPubkey))
   *
   * @param slotIndex  slot to spend (0–31)
   * @param msg        32 bytes to sign (as number[])
   * @returns          64-byte Schnorr signature as number[]
   */
  const spendProof = useCallback(
    async (slotIndex: number, msg: number[]): Promise<number[]> => {
      const apdu = [CASHU_CLA, INS_SPEND_PROOF, slotIndex & 0xff, 0x00, 32].concat(msg);
      return sendAndCheck(apdu, 'SPEND_PROOF');
    },
    [sendAndCheck],
  );

  // ─── Compound provisioning flow ─────────────────────────────────────────

  /**
   * Full provisioning flow for a blank card:
   *   1. GET_INFO — verify blank (pinState=0, no existing proofs)
   *   2. GET_PUBKEY — return for GQL call
   *   3. (caller calls cashuCardProvision GQL, gets proofs back)
   *   4. SET_PIN → VERIFY_PIN → LOAD_PROOF × N
   *
   * @returns card pubkey hex (33-byte compressed)
   * @throws CashuCardError if card is not blank or PIN already set
   */
  const readBlankCardPubkey = useCallback(async (): Promise<{
    pubkey: string;
    info: CardInfo;
  }> => {
    const info = await getInfo();

    if (info.pinState !== 0) {
      throw new CashuCardError(
        'Card already has a PIN set — use top-up flow instead',
      );
    }
    if (info.unspentCount > 0 || info.spentCount > 0) {
      throw new CashuCardError(
        'Card already has proofs — use top-up flow instead',
      );
    }

    const pubkey = await getPubkey();
    return {pubkey, info};
  }, [getInfo, getPubkey]);

  /**
   * Write proofs onto a card after cashuCardProvision GQL call.
   * Handles SET_PIN (blank card) or VERIFY_PIN (top-up).
   *
   * @param proofs      array of {keysetId, amount, nonce, C} proof objects
   * @param pin         PIN to set (blank) or verify (top-up)
   * @param isBlank     true = call SET_PIN first; false = just VERIFY_PIN
   */
  const writeProofs = useCallback(
    async (
      proofs: {keysetId: string; amount: number; nonce: string; C: string}[],
      pin: string,
      isBlank: boolean,
    ): Promise<number[]> => {
      if (isBlank) {
        await setPin(pin);
      }
      await verifyPin(pin);

      const slots: number[] = [];
      for (const proof of proofs) {
        const slot = await loadProof(
          proof.keysetId,
          proof.amount,
          proof.nonce,
          proof.C,
        );
        slots.push(slot);
      }
      return slots;
    },
    [setPin, verifyPin, loadProof],
  );

  return {
    startSession,
    cleanup,
    getInfo,
    getPubkey,
    getBalance,
    getSlotStatuses,
    getProof,
    setPin,
    verifyPin,
    loadProof,
    spendProof,
    readBlankCardPubkey,
    writeProofs,
  };
};

export default useCashuCard;
