import RNFS from "react-native-fs"

import { stripFileScheme } from "./identity-files"

/**
 * Hex SHA-256 of a local file, for `UpgradeEvidenceInput.sha256`.
 *
 * Native on both platforms via react-native-fs, so a multi-MB still never
 * passes through a JS string or blocks the JS thread.
 */
export const fileSha256Hex = (pathOrUri: string): Promise<string> =>
  RNFS.hash(stripFileScheme(pathOrUri), "sha256")
