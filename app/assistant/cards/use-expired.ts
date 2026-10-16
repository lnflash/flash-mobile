import { useEffect, useState } from "react"

/** setTimeout's longest delay; a later expiry is waited for in steps. */
const MAX_TIMER_MS = 2_147_483_647

const isPast = (expiresAt: number | undefined) =>
  expiresAt !== undefined && Date.now() >= expiresAt

/**
 * Whether a card's numbers have gone stale (spec §5, "Expiry"): true from
 * `expiresAt` on, and the card re-renders the moment it passes. Without an
 * expiry, never.
 */
export const useExpired = (expiresAt: number | undefined): boolean => {
  const [expired, setExpired] = useState(() => isPast(expiresAt))

  useEffect(() => {
    if (expiresAt === undefined) {
      setExpired(false)
      return undefined
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      const left = expiresAt - Date.now()
      if (left <= 0) {
        setExpired(true)
        return
      }
      setExpired(false)
      timer = setTimeout(check, Math.min(left, MAX_TIMER_MS))
    }
    check()
    return () => clearTimeout(timer)
  }, [expiresAt])

  return expired
}

/** Whole seconds until `expiresAt`, ticking each second; 0 once past. */
export const useSecondsLeft = (expiresAt: number | undefined): number | undefined => {
  const left = () =>
    expiresAt === undefined
      ? undefined
      : Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  const [seconds, setSeconds] = useState(left)

  useEffect(() => {
    setSeconds(left())
    if (expiresAt === undefined) return undefined
    const timer = setInterval(() => {
      const next = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setSeconds(next)
      if (next === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
    // left() reads only expiresAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt])

  return seconds
}
