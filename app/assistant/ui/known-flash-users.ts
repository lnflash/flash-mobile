import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"

/** Chat contacts are search hints; payment still verifies a username on the server. */
export const knownFlashUsernames = (
  tags: readonly (readonly string[])[] | undefined,
  profiles: ReadonlyMap<string, unknown>,
  hostname: string,
): string[] => {
  const names = new Set<string>()
  for (const tag of tags ?? []) {
    if (tag[0] === "p" && tag[1]) {
      const profile = profiles.get(tag[1])
      if (profile && typeof profile === "object") {
        const nip05 = (profile as { nip05?: unknown }).nip05
        if (typeof nip05 === "string") {
          const [username, host, extra] = nip05.toLowerCase().split("@")
          if (!extra && host === hostname.toLowerCase() && FLASH_USERNAME.test(username))
            names.add(username)
        }
      }
    }
  }
  return [...names]
}
