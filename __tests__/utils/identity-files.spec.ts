/**
 * ENG-608 — captures leave the OS temp directory on accept and are addressed
 * by a document-dir-relative path from then on.
 */
import RNFS from "react-native-fs"

import {
  identityFileExists,
  identityFilePath,
  identityFileUri,
  persistCapture,
  removeIdentityDir,
  removeIdentityFiles,
  stripFileScheme,
} from "@app/utils/identity-files"

const rnfs = RNFS as unknown as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  rnfs.exists.mockResolvedValue(true)
  rnfs.moveFile.mockResolvedValue(undefined)
  rnfs.mkdir.mockResolvedValue(undefined)
  rnfs.unlink.mockResolvedValue(undefined)
})

describe("path resolution", () => {
  it("rebuilds the absolute path under the current document directory", () => {
    // DocumentDirectoryPath is "/tmp" in the mock; on iOS it changes on every
    // app update, which is the whole reason only the relative part persists.
    expect(identityFilePath("idv/front-1.jpg")).toBe("/tmp/idv/front-1.jpg")
    expect(identityFileUri("idv/front-1.jpg")).toBe("file:///tmp/idv/front-1.jpg")
  })

  it("strips only the file scheme", () => {
    expect(stripFileScheme("file:///a/b.jpg")).toBe("/a/b.jpg")
    expect(stripFileScheme("/a/b.jpg")).toBe("/a/b.jpg")
  })

  it("checks existence at the resolved path", async () => {
    rnfs.exists.mockResolvedValue(false)
    await expect(identityFileExists("idv/x.jpg")).resolves.toBe(false)
    expect(rnfs.exists).toHaveBeenCalledWith("/tmp/idv/x.jpg")
  })
})

describe("persistCapture", () => {
  it("moves the still out of temp into idv/ and returns a relative, unique path", async () => {
    const rel = await persistCapture("front", "/var/tmp/cam/abc.jpg", { now: () => 42 })

    expect(rel).toBe("idv/front-42.jpg")
    expect(rnfs.moveFile).toHaveBeenCalledWith(
      "/var/tmp/cam/abc.jpg",
      "/tmp/idv/front-42.jpg",
    )
    expect(rnfs.unlink).not.toHaveBeenCalled()
  })

  it("accepts a file:// URI for the temp still", async () => {
    await persistCapture("selfie", "file:///var/tmp/cam/abc.jpg", { now: () => 7 })
    expect(rnfs.moveFile).toHaveBeenCalledWith(
      "/var/tmp/cam/abc.jpg",
      "/tmp/idv/selfie-7.jpg",
    )
  })

  it("creates the idv directory only when it is missing", async () => {
    rnfs.exists.mockResolvedValueOnce(false)
    await persistCapture("front", "/a.jpg", { now: () => 1 })
    expect(rnfs.mkdir).toHaveBeenCalledWith("/tmp/idv")

    rnfs.mkdir.mockClear()
    rnfs.exists.mockResolvedValueOnce(true)
    await persistCapture("front", "/a.jpg", { now: () => 2 })
    expect(rnfs.mkdir).not.toHaveBeenCalled()
  })

  it("removes the previous file for that side on a retake", async () => {
    const rel = await persistCapture("back", "/a.jpg", {
      previous: "idv/back-1.jpg",
      now: () => 2,
    })

    expect(rel).toBe("idv/back-2.jpg")
    expect(rnfs.unlink).toHaveBeenCalledWith("/tmp/idv/back-1.jpg")
  })

  it("a previous file that is already gone does not fail the retake", async () => {
    rnfs.unlink.mockRejectedValueOnce(new Error("ENOENT"))
    await expect(
      persistCapture("back", "/a.jpg", { previous: "idv/back-1.jpg", now: () => 2 }),
    ).resolves.toBe("idv/back-2.jpg")
  })

  it("surfaces a failed move so the caller does not persist a path that has no file", async () => {
    rnfs.moveFile.mockRejectedValueOnce(new Error("EACCES"))
    await expect(persistCapture("front", "/a.jpg")).rejects.toThrow("EACCES")
  })
})

describe("removeIdentityFiles", () => {
  it("unlinks every capture present and skips the rest", async () => {
    const image = (side: string) => ({
      path: `idv/${side}-1.jpg`,
      width: 1,
      height: 1,
      fileName: "x",
      type: "image/jpeg",
    })
    await removeIdentityFiles({
      front: image("front"),
      back: undefined,
      selfie: image("selfie"),
    })

    expect(rnfs.unlink).toHaveBeenCalledTimes(2)
    expect(rnfs.unlink).toHaveBeenCalledWith("/tmp/idv/front-1.jpg")
    expect(rnfs.unlink).toHaveBeenCalledWith("/tmp/idv/selfie-1.jpg")
  })

  it("tolerates a file that is already gone", async () => {
    rnfs.unlink.mockRejectedValue(new Error("ENOENT"))
    await expect(
      removeIdentityFiles({
        front: {
          path: "idv/f.jpg",
          width: 1,
          height: 1,
          fileName: "f",
          type: "image/jpeg",
        },
      }),
    ).resolves.toBeUndefined()
  })
})

describe("removeIdentityDir", () => {
  it("unlinks the whole idv directory under the current document directory", async () => {
    // Logout resets the slice, so nothing would reference files left behind;
    // the directory itself has to go, not just the sides the state knows of.
    await removeIdentityDir()
    expect(rnfs.unlink).toHaveBeenCalledTimes(1)
    expect(rnfs.unlink).toHaveBeenCalledWith("/tmp/idv")
  })

  it("is a no-op when the directory was never created", async () => {
    rnfs.unlink.mockRejectedValueOnce(new Error("ENOENT"))
    await expect(removeIdentityDir()).resolves.toBeUndefined()
  })
})
