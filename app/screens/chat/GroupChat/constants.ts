import Config from "react-native-config"

// Default NIP-29 relay + support group. groups.0xchat.com is the production
// default, but both are overridable via env config so we don't hard-code
// third-party infrastructure (per #641 review).
export const NIP29_DEFAULT_RELAY_URL =
  Config.NIP29_RELAY_URL || "wss://groups.0xchat.com"
export const NIP29_DEFAULT_GROUP_ID =
  Config.NIP29_SUPPORT_GROUP_ID || "A9lScksyYAOWNxqR"

// Verbose NIP-29 logging, gated to dev builds so signed events / relay chatter
// never hit production logs.
export const nip29Log = (...args: unknown[]) => {
  if (__DEV__) console.log("[nip29]", ...args)
}
export const nip29Warn = (...args: unknown[]) => {
  if (__DEV__) console.warn("[nip29]", ...args)
}

// NIP-29 roles as declared by the relay's kind 39003 event. groups.0xchat.com
// (khatru) only honors these role labels; an unknown label like "admin" is stored
// but granted no permissions. Both king and bishop can delete events (kind 9005);
// only king can promote other users.
export const NIP29_ROLE_KING = "king"
export const NIP29_ROLE_BISHOP = "bishop"
export type Nip29Role = typeof NIP29_ROLE_KING | typeof NIP29_ROLE_BISHOP
