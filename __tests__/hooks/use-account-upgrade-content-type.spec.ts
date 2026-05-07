/**
 * ENG-291 — Bug: HTTP 400 on account upgrade Step 4 (ID document upload)
 *
 * Root cause: Android `react-native-image-picker` returns `image/jpg` for some
 * camera-captured photos. The backend storage service only accepts:
 *   ["image/jpeg", "image/png", "image/webp"]
 *
 * `image/jpg` is NOT in the backend allowlist, causing `InvalidFileTypeError`
 * → upload URL not generated → submission fails with HTTP 400.
 *
 * Fix: normalize `image/jpg` → `image/jpeg` before calling the upload mutation.
 */

import { normalizeContentType, isValidContentType } from "@app/utils/image-content-type"

describe("normalizeContentType (ENG-291)", () => {
  it("normalizes image/jpg to image/jpeg", () => {
    expect(normalizeContentType("image/jpg")).toBe("image/jpeg")
  })

  it("leaves image/jpeg unchanged", () => {
    expect(normalizeContentType("image/jpeg")).toBe("image/jpeg")
  })

  it("leaves image/png unchanged", () => {
    expect(normalizeContentType("image/png")).toBe("image/png")
  })

  it("leaves image/webp unchanged", () => {
    expect(normalizeContentType("image/webp")).toBe("image/webp")
  })

  it("leaves unknown types unchanged (backend will reject)", () => {
    expect(normalizeContentType("image/heic")).toBe("image/heic")
  })
})

describe("isValidContentType (ENG-291 — backend-compatible)", () => {
  const BACKEND_ALLOWED = ["image/jpeg", "image/png", "image/webp"]

  it("accepts image/jpeg", () => {
    expect(isValidContentType("image/jpeg")).toBe(true)
  })

  it("accepts image/png", () => {
    expect(isValidContentType("image/png")).toBe(true)
  })

  it("accepts image/webp", () => {
    expect(isValidContentType("image/webp")).toBe(true)
  })

  it("rejects image/jpg (non-normalized — was causing the bug)", () => {
    // Before the fix, image/jpg was in ALLOWED_FILE_TYPES client-side
    // but not in the backend allowlist — this test documents that we no longer
    // send image/jpg raw; we normalize first
    expect(isValidContentType("image/jpg")).toBe(false)
  })

  it("rejects image/heic", () => {
    expect(isValidContentType("image/heic")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(isValidContentType("")).toBe(false)
  })

  it("all backend-allowed types pass", () => {
    BACKEND_ALLOWED.forEach((type) => {
      expect(isValidContentType(type)).toBe(true)
    })
  })
})
