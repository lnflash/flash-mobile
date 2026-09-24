/**
 * ENG-608 — where ID captures live on disk.
 *
 * vision-camera writes stills to the OS temp directory, which the OS may purge
 * once the app closes, and on iOS the app container's absolute path changes on
 * every update. Captures are therefore moved into the app's document
 * directory on accept and the slice persists a path RELATIVE to that
 * directory; the absolute path is rebuilt at read time.
 */
import RNFS from "react-native-fs"

import type {
  IdentitySide,
  IdentityState,
} from "@app/store/redux/slices/accountUpgradeSlice"

/** Sub-directory of the document directory holding the captures. */
export const IDENTITY_DIR = "idv"

const FILE_SCHEME = "file://"

/** `file:///a/b.jpg` → `/a/b.jpg`; a bare path is returned untouched. */
export const stripFileScheme = (uri: string): string =>
  uri.startsWith(FILE_SCHEME) ? uri.slice(FILE_SCHEME.length) : uri

/** Absolute filesystem path for a persisted (document-dir-relative) capture path. */
export const identityFilePath = (relativePath: string): string =>
  `${RNFS.DocumentDirectoryPath}/${relativePath}`

/** `file://` URI for `<Image source>` and `fetch` of a persisted capture. */
export const identityFileUri = (relativePath: string): string =>
  `${FILE_SCHEME}${identityFilePath(relativePath)}`

/** True when the persisted capture is still on disk. */
export const identityFileExists = (relativePath: string): Promise<boolean> =>
  RNFS.exists(identityFilePath(relativePath))

/**
 * Move a fresh still out of the temp directory into `<documents>/idv/` and
 * return its document-dir-relative path. The name carries a timestamp so a
 * retake never reuses a URI the image cache (or a recorded upload key) may
 * still be holding; the previous file for that side is removed.
 */
export const persistCapture = async (
  side: IdentitySide,
  tempPathOrUri: string,
  options: {
    /** The side's previous capture, deleted once the new one is in place. */
    previous?: string
    /** Clock for the file name; injectable for tests. */
    now?: () => number
  } = {},
): Promise<string> => {
  const { previous, now = Date.now } = options
  const dir = identityFilePath(IDENTITY_DIR)
  if (!(await RNFS.exists(dir))) {
    await RNFS.mkdir(dir)
  }
  const relativePath = `${IDENTITY_DIR}/${side}-${now()}.jpg`
  await RNFS.moveFile(stripFileScheme(tempPathOrUri), identityFilePath(relativePath))
  if (previous && previous !== relativePath) {
    await removeIdentityFile(previous)
  }
  return relativePath
}

/** Best-effort delete; a file that is already gone is not an error. */
export const removeIdentityFile = async (relativePath: string): Promise<void> => {
  try {
    await RNFS.unlink(identityFilePath(relativePath))
  } catch {
    // Already gone, or the OS purged it — nothing to do.
  }
}

/**
 * Delete the whole `<documents>/idv/` directory, captures and all. For logout:
 * the slice is reset there, so anything left on disk would have nothing
 * referencing it and would otherwise sit in the (iOS-backed-up) document
 * directory for the next account on the phone. Best-effort like the rest.
 */
export const removeIdentityDir = async (): Promise<void> => {
  try {
    await RNFS.unlink(identityFilePath(IDENTITY_DIR))
  } catch {
    // Never created, or already gone — nothing to do.
  }
}

/** Delete every capture file the identity state points at. */
export const removeIdentityFiles = async (
  identity: Pick<IdentityState, "front" | "back" | "selfie">,
): Promise<void> => {
  const sides: IdentitySide[] = ["front", "back", "selfie"]
  await Promise.all(
    sides.map((side) => {
      const image = identity[side]
      return image?.path ? removeIdentityFile(image.path) : Promise.resolve()
    }),
  )
}
