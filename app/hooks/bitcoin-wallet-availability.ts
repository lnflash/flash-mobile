/** React Native reports an iOS version as either a number or a dotted string. */
export const bitcoinWalletAvailable = (
  platform: string,
  version: string | number,
): boolean => platform !== "ios" || parseInt(String(version), 10) >= 13
