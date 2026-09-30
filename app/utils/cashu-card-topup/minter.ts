/**
 * When the app asks the mint about its saved top-ups without the card
 * (`advanceTopUps`): at launch, on every return to the foreground, whenever a
 * screen nudges it (a payment just went out), and every `pollMs` for as long
 * as a payment may still land. A paid quote is minted only until its expiry,
 * so this must not wait for the top-up screen, or for a tap.
 *
 * Nothing is scheduled while the app is in the background, where JS timers
 * cannot be relied on; the next foreground asks again. One pass runs at a
 * time, and a nudge during a pass runs one more pass after it.
 */
export type MinterLoopOptions = {
  /** One pass; resolves how many top-ups may still see a payment land. */
  run: () => Promise<{ waiting: number }>
  pollMs: number
  /** Whether the app is in the foreground. */
  isActive: () => boolean
}

export type MinterLoop = {
  /** Ask the mint now. */
  nudge: () => void
  /** Drop the scheduled pass (the app left the foreground); a nudge resumes. */
  pause: () => void
  stop: () => void
}

export const createMinterLoop = ({
  run,
  pollMs,
  isActive,
}: MinterLoopOptions): MinterLoop => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let again = false
  let stopped = false

  const pause = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const pass = (): void => {
    if (stopped) return
    if (running) {
      again = true
      return
    }
    pause()
    running = true
    run()
      // A pass that could not run at all (the saved top-ups unreadable) is
      // not retried on a timer: the next foreground or nudge asks again.
      .then(
        ({ waiting }) => waiting,
        () => 0,
      )
      .then((waiting) => {
        running = false
        if (stopped) return
        if (again) {
          again = false
          pass()
        } else if (waiting > 0 && isActive()) {
          timer = setTimeout(pass, pollMs)
        }
      })
  }

  return {
    nudge: pass,
    pause,
    stop: () => {
      stopped = true
      pause()
    },
  }
}
