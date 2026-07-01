declare module "react-native-randombytes" {
  export function randomBytes(size: number): Buffer
  export function randomBytes(
    size: number,
    callback: (error: Error | null, bytes?: Buffer) => void,
  ): void
}
