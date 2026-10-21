import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { spokenReplyFor } from "@app/assistant/ui/spoken-reply"
import { toUsdMoneyAmount } from "@app/types/amounts"
import type { ThreadEntry } from "@app/assistant/ui/thread-store"
loadLocale("en")
const LL = i18nObject("en")
const display = {
  displayCurrency: "USD",
  formatMoneyAmount: jest.fn(({ moneyAmount }) => String(moneyAmount.amount / 100)),
  formatCurrency: jest.fn(() => "price"),
}
it("uses the exact displayed help and marks sensitive guidance manual", () => {
  const help: ThreadEntry = { id: "help", kind: "help", topic: "funding" }
  expect(spokenReplyFor(help, { LL, locale: "en", display })).toEqual({
    text: LL.AskFlashHelp.funding(),
    locale: "en-US",
    automatic: true,
  })
  expect(
    spokenReplyFor({ ...help, topic: "paymentStatus" }, { LL, locale: "en", display })
      ?.automatic,
  ).toBe(false)
})
it("includes the real saved time, currency and unavailable state rather than speaking zero", () => {
  const entry: ThreadEntry = {
    id: "balances",
    kind: "balances",
    stale: true,
    asOf: 1760000000000,
    payload: {
      balances: [
        { wallet: "USD", state: "ok", balance: toUsdMoneyAmount(1234) },
        { wallet: "BTC", state: "disabled", replyKey: "Assistant.btcDisabled" },
      ],
    },
  }
  const reply = spokenReplyFor(entry, { LL, locale: "en", display })
  expect(reply?.automatic).toBe(false)
  expect(reply?.text).toContain(
    LL.AskFlashHelp.savedAt({
      time: new Date(entry.asOf as number).toLocaleString("en"),
    }),
  )
  expect(reply?.text).toContain("12.34 US dollars")
  expect(reply?.text).toContain(LL.Assistant.btcDisabled())
  expect(display.formatMoneyAmount).toHaveBeenCalledWith(
    expect.objectContaining({ noSymbol: true, noSuffix: true }),
  )
})
it("never narrates payment cards and never automatically reads an address", () => {
  expect(
    spokenReplyFor({ id: "card", kind: "card", card: {} }, { LL, locale: "en", display }),
  ).toBeUndefined()
  const reply = spokenReplyFor(
    {
      id: "address",
      kind: "address",
      state: "available",
      address: "alice@test.flashapp.me",
      stale: false,
    },
    { LL, locale: "en", display },
  )
  expect(reply?.automatic).toBe(false)
  expect(reply?.text).toContain("alice at test dot flashapp dot me")
})
it("uses the actual English fallback language and avoids unlocalized financial narration", () => {
  expect(
    spokenReplyFor(
      { id: "help", kind: "help", topic: "offline" },
      { LL, locale: "es", display },
    )?.locale,
  ).toBe("en-US")
  expect(
    spokenReplyFor(
      { id: "b", kind: "balances", stale: false, payload: { balances: [] } },
      { LL, locale: "es", display },
    ),
  ).toBeUndefined()
})
