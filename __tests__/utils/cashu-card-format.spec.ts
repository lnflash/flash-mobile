/**
 * Setup's limits row (ENG-827): the summary the holder confirms before the
 * tap never leaves out a limit setup is about to write.
 */
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { limitsSummary } from "../../app/utils/cashu-card-format"
import { NO_LIMITS } from "../../app/utils/cashu-card-owner"

loadLocale("en")
const LL = i18nObject("en")

describe("limitsSummary", () => {
  it("is none for a new card's limits", () => {
    expect(limitsSummary(NO_LIMITS, LL)).toBe("none")
  })

  it("names the daily limit when it is the only one", () => {
    expect(limitsSummary({ ...NO_LIMITS, day: 5000 }, LL)).toBe("5,000 sats a day")
  })

  it("is the holder's own, never the daily limit alone, with a no-PIN allowance", () => {
    // spec/APDU.md: the allowance lets a card with a PIN sign without it.
    expect(limitsSummary({ ...NO_LIMITS, day: 5000, allowance: 1000 }, LL)).toBe(
      "your own",
    )
  })

  it("is the holder's own with a per-payment limit or another rollover budget", () => {
    expect(limitsSummary({ ...NO_LIMITS, day: 5000, payment: 1000 }, LL)).toBe("your own")
    expect(limitsSummary({ ...NO_LIMITS, day: 5000, rollBudget: 3 }, LL)).toBe("your own")
    expect(limitsSummary({ ...NO_LIMITS, allowance: 1000 }, LL)).toBe("your own")
  })
})
