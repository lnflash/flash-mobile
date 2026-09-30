/**
 * ENG-616: when the app asks the mint about its saved top-ups without the
 * card. A paid quote can be minted only until its expiry, so the asking must
 * not stop when the top-up screen does: it runs at launch, on a nudge, and
 * on a timer for as long as a payment may still land, in the foreground.
 */
import { createMinterLoop } from "../../app/utils/cashu-card-topup"

const POLL_MS = 15_000

let active: boolean
let waiting: number
let run: jest.Mock<Promise<{ waiting: number }>, []>

/** Let the pass's promise chain settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

beforeEach(() => {
  jest.useFakeTimers()
  active = true
  waiting = 1
  run = jest.fn(async () => ({ waiting }))
})

afterEach(() => {
  jest.useRealTimers()
})

const loop = () => createMinterLoop({ run, pollMs: POLL_MS, isActive: () => active })

describe("createMinterLoop", () => {
  it("asks again every poll while a payment may still land, and stops once none may", async () => {
    const minter = loop()
    minter.nudge()
    await settle()
    expect(run).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(2)

    waiting = 0
    jest.advanceTimersByTime(POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(3)

    jest.advanceTimersByTime(10 * POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(3)
    minter.stop()
  })

  it("schedules nothing in the background, and a return to the foreground asks at once", async () => {
    const minter = loop()
    minter.nudge()
    await settle()
    minter.pause()
    active = false

    jest.advanceTimersByTime(10 * POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(1)

    active = true
    minter.nudge()
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    minter.stop()
  })

  it("runs one pass at a time: a nudge during a pass runs one more after it", async () => {
    let finish: (() => void) | undefined
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ waiting: 0 })
        }),
    )
    waiting = 0
    const minter = loop()
    minter.nudge()
    minter.nudge()
    minter.nudge()
    expect(run).toHaveBeenCalledTimes(1)

    finish?.()
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    minter.stop()
  })

  it("a pass that could not run is not retried on a timer; the next nudge asks again", async () => {
    run.mockRejectedValueOnce(new Error("User interaction is not allowed"))
    const minter = loop()
    minter.nudge()
    await settle()

    jest.advanceTimersByTime(10 * POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(1)

    minter.nudge()
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    minter.stop()
  })

  it("does nothing once stopped", async () => {
    const minter = loop()
    minter.nudge()
    await settle()
    minter.stop()

    minter.nudge()
    jest.advanceTimersByTime(10 * POLL_MS)
    await settle()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
