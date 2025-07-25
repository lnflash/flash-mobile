import * as Keychain from "react-native-keychain"

export const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"

export const validateNsec = (nsec: string) => {
  const bech32Pattern = /^nsec1[a-z0-9]{58}$/
  return bech32Pattern.test(nsec)
}

export const importNsec = async (
  nsec: string,
  onError: (msg: string) => void,
  updateFlashBackend: () => Promise<unknown>,
) => {
  if (!nsec) {
    onError("nsec cannot be empty")
    return false
  }

  if (!validateNsec(nsec)) {
    onError("Invalid nsec format. Please check the key and try again.")
    return false
  }

  try {
    // Save the nsec key to the keychain
    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      nsec,
    )
    await updateFlashBackend()
    return true
  } catch (error) {
    console.error("Failed to save nsec to keychain", error)
    onError("Failed to import nsec. Please try again.")
    return false
  }
}
