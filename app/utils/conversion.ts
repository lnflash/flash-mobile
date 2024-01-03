import { base64ToBytes as b64ToBytes } from "byte-base64"

type BytesLikeType = Uint8Array | number[] | string

export const base64ToBytes = (data: BytesLikeType): Uint8Array => {
  return typeof data === "string"
    ? b64ToBytes(data)
    : data instanceof Uint8Array
    ? data
    : Uint8Array.from(data)
}
