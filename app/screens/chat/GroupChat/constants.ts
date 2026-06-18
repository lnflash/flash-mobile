export const NIP29_DEFAULT_GROUP_ID = "A9lScksyYAOWNxqR"
export const NIP29_DEFAULT_RELAY_URL = "wss://groups.0xchat.com"

// NIP-29 roles as declared by the relay's kind 39003 event. groups.0xchat.com
// (khatru) only honors these role labels; an unknown label like "admin" is stored
// but granted no permissions. Both king and bishop can delete events (kind 9005);
// only king can promote other users.
export const NIP29_ROLE_KING = "king"
export const NIP29_ROLE_BISHOP = "bishop"
export type Nip29Role = typeof NIP29_ROLE_KING | typeof NIP29_ROLE_BISHOP
