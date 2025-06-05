export const SetAddressError = {
  TOO_SHORT: "TOO_SHORT",
  TOO_LONG: "TOO_LONG",
  INVALID_CHARACTER: "INVALID_CHARACTER",
  STARTS_WITH_NUMBER: "STARTS_WITH_NUMBER",
  ADDRESS_UNAVAILABLE: "ADDRESS_UNAVAILABLE",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const

export type SetAddressError = (typeof SetAddressError)[keyof typeof SetAddressError]
