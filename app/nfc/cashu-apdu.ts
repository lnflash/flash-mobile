/**
 * cashu-apdu.ts
 *
 * APDU builders and response parsers for the Cashu JavaCard applet
 * (AID: D2 76 00 00 85 01 02, NUT-XX Profile B).
 *
 * Proof storage layout on-card (77-byte payload per slot):
 *   keyset_id [ 8]  — raw bytes from keyset hex ID
 *   amount    [ 4]  — uint32 big-endian (denomination in cents/sats per keyset)
 *   nonce     [32]  — the nonce field from the P2PK secret JSON
 *   C         [33]  — compressed EC point (blind sig unblinded)
 *
 * The full P2PK secret JSON is NOT stored on-card. The POS reconstructs it
 * from (nonce, card_pubkey) since cardPubKey is always readable via GET_PUBKEY:
 *   secret = JSON.stringify(["P2PK", {nonce: hex(nonce), data: card_pubkey, tags: [["sigflag","SIG_INPUTS"]]}])
 *
 * For SPEND_PROOF, msg = SHA256(secret_json_string).
 *
 * @see https://github.com/lnflash/cashu-javacard/blob/main/spec/APDU.md
 */

/** CLA byte for all Cashu applet commands */
export const CASHU_CLA = 0xb0;

/** AID: D2 76 00 00 85 01 02 */
export const CASHU_AID = new Uint8Array([0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]);

// Instruction bytes
export const INS_GET_INFO        = 0x01;
export const INS_GET_PUBKEY      = 0x10;
export const INS_GET_BALANCE     = 0x11;
export const INS_GET_PROOF_COUNT = 0x12;
export const INS_GET_PROOF       = 0x13;
export const INS_GET_SLOT_STATUS = 0x14;
export const INS_SPEND_PROOF     = 0x20;
export const INS_SIGN_ARBITRARY  = 0x21;
export const INS_LOAD_PROOF      = 0x30;
export const INS_CLEAR_SPENT     = 0x31;
export const INS_VERIFY_PIN      = 0x40;
export const INS_SET_PIN         = 0x41;
export const INS_CHANGE_PIN      = 0x42;
export const INS_LOCK_CARD       = 0x50;

// Status words
export const SW_OK                   = 0x9000;
export const SW_WRONG_LENGTH         = 0x6700;
export const SW_SECURITY_NOT_SATIS   = 0x6982;
export const SW_PIN_BLOCKED          = 0x6983;
export const SW_PIN_NOT_SET          = 0x6984;
export const SW_CONDITIONS_NOT_SATIS = 0x6985;
export const SW_SLOT_OUT_OF_RANGE    = 0x6a83;
export const SW_NO_SPACE             = 0x6a84;
export const SW_SLOT_EMPTY           = 0x6a88;

// Slot status constants
export const SLOT_EMPTY   = 0x00;
export const SLOT_UNSPENT = 0x01;
export const SLOT_SPENT   = 0x02;

// ─────────────────────────────────────────────────────────────────────────────
// Card info / proof types
// ─────────────────────────────────────────────────────────────────────────────

export interface CardInfo {
  versionMajor: number;
  versionMinor: number;
  maxSlots: number;
  unspentCount: number;
  spentCount: number;
  emptyCount: number;
  capabilities: number; // bitmask: bit0=secp256k1, bit1=Schnorr, bit2=PIN
  pinState: number;     // 0=unset, 1=set, 2=locked
}

export interface CardProof {
  /** Slot index on card */
  slotIndex: number;
  /** Status: 0=empty, 1=unspent, 2=spent */
  status: number;
  /** Keyset ID (8 bytes as hex string) */
  keysetId: string;
  /** Denomination amount */
  amount: number;
  /** 32-byte nonce (from P2PK secret) as hex */
  nonce: string;
  /** 33-byte compressed C point as hex */
  C: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// APDU builders
// ─────────────────────────────────────────────────────────────────────────────

/** SELECT AID command */
export function buildSelectAid(): number[] {
  const aid: number[] = [];
  for (let i = 0; i < CASHU_AID.length; i++) aid.push(CASHU_AID[i]);
  return [0x00, 0xa4, 0x04, 0x00, CASHU_AID.length].concat(aid);
}

/** GET_INFO (B0 01 00 00 00) */
export function buildGetInfo(): number[] {
  return [CASHU_CLA, INS_GET_INFO, 0x00, 0x00, 0x00];
}

/** GET_PUBKEY (B0 10 00 00 00) */
export function buildGetPubkey(): number[] {
  return [CASHU_CLA, INS_GET_PUBKEY, 0x00, 0x00, 0x00];
}

/** GET_BALANCE (B0 11 00 00 00) */
export function buildGetBalance(): number[] {
  return [CASHU_CLA, INS_GET_BALANCE, 0x00, 0x00, 0x00];
}

/** GET_PROOF at slot index (B0 13 P1 00 00) */
export function buildGetProof(slotIndex: number): number[] {
  return [CASHU_CLA, INS_GET_PROOF, slotIndex & 0xff, 0x00, 0x00];
}

/** GET_SLOT_STATUS (B0 14 00 00 00) */
export function buildGetSlotStatus(): number[] {
  return [CASHU_CLA, INS_GET_SLOT_STATUS, 0x00, 0x00, 0x00];
}

/**
 * LOAD_PROOF — write 77 bytes of proof data.
 * Requires VERIFY_PIN session if PIN is set.
 *
 * @param keysetIdHex  16-character hex string (8 bytes)
 * @param amount       denomination uint32
 * @param nonceHex     64-character hex string (32 bytes, from P2PK secret nonce)
 * @param cHex         66-character hex string (33 bytes compressed point)
 */
export function buildLoadProof(
  keysetIdHex: string,
  amount: number,
  nonceHex: string,
  cHex: string,
): number[] {
  const payload = new Uint8Array(77);
  const kidBytes = hexToBytes(keysetIdHex);
  payload.set(kidBytes.slice(0, 8), 0);
  payload[8]  = (amount >>> 24) & 0xff;
  payload[9]  = (amount >>> 16) & 0xff;
  payload[10] = (amount >>> 8) & 0xff;
  payload[11] = amount & 0xff;
  const nonceBytes = hexToBytes(nonceHex);
  payload.set(nonceBytes.slice(0, 32), 12);
  const cBytes = hexToBytes(cHex);
  payload.set(cBytes.slice(0, 33), 44);

  const payloadArr: number[] = [];
  for (let i = 0; i < payload.length; i++) payloadArr.push(payload[i]);
  return [CASHU_CLA, INS_LOAD_PROOF, 0x00, 0x00, 77].concat(payloadArr);
}

/**
 * VERIFY_PIN — authenticate provisioning session.
 * @param pinBytes  4–8 ASCII bytes of the PIN
 */
export function buildVerifyPin(pinBytes: number[]): number[] {
  return [CASHU_CLA, INS_VERIFY_PIN, 0x00, 0x00, pinBytes.length, ...pinBytes];
}

/**
 * SET_PIN — first-time PIN setup (one-time only, no auth required).
 * @param pinBytes  4–8 ASCII bytes
 */
export function buildSetPin(pinBytes: number[]): number[] {
  return [CASHU_CLA, INS_SET_PIN, 0x00, 0x00, pinBytes.length, ...pinBytes];
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse GET_INFO 8-byte response */
export function parseCardInfo(data: number[]): CardInfo {
  return {
    versionMajor: data[0],
    versionMinor: data[1],
    maxSlots:     data[2],
    unspentCount: data[3],
    spentCount:   data[4],
    emptyCount:   data[5],
    capabilities: data[6],
    pinState:     data[7],
  };
}

/** Parse GET_PUBKEY response (33 or 65 bytes) → hex string */
export function parsePubkey(data: number[]): string {
  // Normalise: if 65-byte uncompressed (0x04 prefix), compress it
  if (data.length === 65 && data[0] === 0x04) {
    return compressPoint(data);
  }
  return bytesToHex(data);
}

/** Parse GET_PROOF 78-byte response */
export function parseProof(data: number[], slotIndex: number): CardProof {
  return {
    slotIndex,
    status:   data[0],
    keysetId: bytesToHex(data.slice(1, 9)),
    amount:   (data[9] << 24) | (data[10] << 16) | (data[11] << 8) | data[12],
    nonce:    bytesToHex(data.slice(13, 45)),
    C:        bytesToHex(data.slice(45, 78)),
  };
}

/** Parse GET_BALANCE 4-byte uint32 */
export function parseBalance(data: number[]): number {
  return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
}

/** Extract SW (last 2 bytes of raw response) */
export function getSW(response: number[]): number {
  const n = response.length;
  return ((response[n - 2] & 0xff) << 8) | (response[n - 1] & 0xff);
}

/** Data bytes (everything before last 2 SW bytes) */
export function getResponseData(response: number[]): number[] {
  return response.slice(0, response.length - 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const len = hex.length;
  const out = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: number[] | Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = (bytes[i] & 0xff).toString(16);
    hex += h.length === 1 ? '0' + h : h;
  }
  return hex;
}

export function pinStringToBytes(pin: string): number[] {
  return pin.split('').map(c => c.charCodeAt(0));
}

/** Compress an uncompressed EC point (0x04 prefix, 65 bytes) */
function compressPoint(uncompressed: number[]): string {
  const x = uncompressed.slice(1, 33);
  const yLastByte = uncompressed[64];
  const prefix = yLastByte % 2 === 0 ? 0x02 : 0x03;
  return bytesToHex([prefix, ...x]);
}

/**
 * Reconstruct the P2PK secret JSON string from on-card data.
 * Used to compute the message hash for SPEND_PROOF verification.
 *
 * Format:
 *   ["P2PK",{"nonce":"<nonce_hex>","data":"<card_pubkey_hex>","tags":[["sigflag","SIG_INPUTS"]]}]
 */
export function reconstructP2PKSecret(nonceHex: string, cardPubkeyHex: string): string {
  return JSON.stringify([
    'P2PK',
    {
      nonce: nonceHex,
      data: cardPubkeyHex,
      tags: [['sigflag', 'SIG_INPUTS']],
    },
  ]);
}
