import RNFS from "react-native-fs"
import { sha256 } from "js-sha256"
import { Buffer } from "buffer"

/**
 * Hex SHA-256 of a local file, for `UpgradeEvidenceInput.sha256`.
 *
 * Pure JS on top of deps already in the tree (js-sha256, buffer,
 * react-native-fs) — no new native module. The file is read as base64 and
 * hashed in memory; ID stills are a few MB so this is fine on the JS thread.
 */
export const fileSha256Hex = async (uri: string): Promise<string> => {
  const path = uri.startsWith("file://") ? uri.slice("file://".length) : uri
  const encoded = await RNFS.readFile(path, "base64")
  return sha256.hex(Buffer.from(encoded, "base64"))
}
