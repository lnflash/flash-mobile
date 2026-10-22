import { platform } from "./platform"
import { checkVoiceUnavailable, failVoice } from "./voice-replay"
import React from "react"
import { Alert } from "react-native"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
  within,
} from "@testing-library/react-native"
import { ApolloClient, ApolloLink, ApolloProvider, gql, Observable } from "@apollo/client"
import { ThemeProvider } from "@rneui/themed"
import { nip05, type Event } from "nostr-tools"
import {
  ContactsDocument,
  HomeAuthedDocument,
  WalletCurrency,
} from "@app/graphql/generated"
import { createCache } from "@app/graphql/cache"
import { AskFlashScreen } from "@app/assistant/ui/ask-flash-screen"
import { FeatureFlagContext } from "@app/config/feature-flags-context"
import { answerUtterance } from "@app/assistant/ui/turn"
import { useKnownFlashUsers } from "@app/assistant/ui/use-known-flash-users"
import { searchFlashUsernames } from "@app/assistant/rails/username-search"
import { lookupFlashUsername } from "@app/assistant/registry/read/lookup-flash-username"
import { nativeVoiceInput, type VoiceEvent } from "@app/assistant/ui/native-voice-input"
import type { ToolCall } from "@app/assistant/engine/intent-router"
import type { ThreadEntry } from "@app/assistant/ui/thread-store"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"
import { CASH_WALLETS, env, fakeRuntime } from "../ui/thread-harness"
import {
  accountsOf,
  bolt11,
  graphqlTx,
  JMD_PRICE,
  NOW_MS,
  page,
  USD_PRICE,
  wallet,
} from "../fakes"
import type {
  Outcome,
  Scenario,
  ScenarioResult,
  ScenarioState,
  ScenarioStep,
  ScenarioSuite,
} from "./types"

loadLocale("en")
const LL = i18nObject("en")
const SCOPE = "scenario-session-a"
const INDEX = gql`
  query ScenarioIndex {
    assistantRecentUsers @client
  }
`
const WALLET = gql`
  query ScenarioWallet($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
      walletCurrency
    }
  }
`
const IDENTITY = gql`
  query ScenarioIdentity {
    me {
      id
      username
    }
  }
`

const ownId = "scenario-account"
const makeClient = (search: () => readonly string[]) =>
  new ApolloClient({
    cache: createCache(),
    connectToDevTools: false,
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          if (operation.operationName !== "searchUsernames") {
            observer.error(
              new Error(`Unscripted Apollo request: ${operation.operationName}`),
            )
            return
          }
          try {
            observer.next({ data: { searchUsernames: search() } })
            observer.complete()
          } catch (error) {
            observer.error(error)
          }
        }),
    ),
  }) as ApolloClient<unknown>

const preparePlatform = () => {
  platform.reset()
  jest.spyOn(Date, "now").mockReturnValue(NOW_MS)
  return jest
    .spyOn(global, "fetch")
    .mockRejectedValue(new Error("Scenario attempted an unscripted network request"))
}
const openScreen = (
  view: ReturnType<typeof render> | undefined,
  expected: Extract<ScenarioStep, { openScreen: unknown }>["openScreen"],
) => {
  if (!view) throw new Error("Navigation requires screen replay")
  const before = platform.navigate.mock.calls.length
  const button = view.getAllByTestId("ask-flash-screen-action").at(-1)
  if (!button) throw new Error("No screen action was offered")
  expect(button.props.accessibilityRole).toBe("button")
  fireEvent.press(button)
  expect(platform.navigate).toHaveBeenCalledTimes(before + 1)
  expect(platform.navigate).toHaveBeenLastCalledWith(
    ...(expected.params ? [expected.route, expected.params] : [expected.route]),
  )
}

const chatEvent = (contacts: string[], users: ScenarioSuite["users"]): Event => ({
  id: "fixture-contacts",
  kind: 3,
  pubkey: platform.ownPubkey,
  content: "",
  sig: "0".repeat(128),
  // Nostr wire field.
  // eslint-disable-next-line camelcase
  created_at: 100,
  tags: contacts.map((name) => ["p", users[name].pubkey]),
})

const serviceReads = (
  harnesses: ReturnType<typeof fakeRuntime>[],
  verification: number,
) => ({
  verification,
  btc: harnesses.reduce((n, h) => n + h.btcRail.getBalanceSats.mock.calls.length, 0),
  ...Object.fromEntries(
    ["wallets", "realtimePrice", "transactions"].map((name) => [
      name,
      harnesses.reduce(
        (n, h) =>
          n +
          h.graphql[name as "wallets" | "realtimePrice" | "transactions"].mock.calls
            .length,
        0,
      ),
    ]),
  ),
})

const dispatchCount = (allHarnesses: ReturnType<typeof fakeRuntime>[]) =>
  allHarnesses.reduce(
    (total, h) =>
      total +
      Object.values(h.mutations).reduce((n, fn) => n + fn.mock.calls.length, 0) +
      [
        h.btcRail.payInvoice,
        h.btcRail.payLnurl,
        h.btcRail.payOnchain,
        h.actions.initiateCashout,
      ].reduce((n, fn) => n + fn.mock.calls.length, 0),
    0,
  )

const assertSideEffects = (
  harnesses: ReturnType<typeof fakeRuntime>[],
  deliberate: { contacts: number; support: number; wallet: number; navigation: number },
  network: ReturnType<typeof preparePlatform>,
) => {
  expect(dispatchCount(harnesses)).toBe(0)
  expect(platform.publish.mock.calls).toHaveLength(deliberate.contacts)
  expect(platform.openSupport.mock.calls).toHaveLength(deliberate.support)
  expect(platform.walletRequest.mock.calls).toHaveLength(deliberate.wallet)
  expect(platform.navigate.mock.calls).toHaveLength(deliberate.navigation)
  expect(network).not.toHaveBeenCalled()
}

export async function replay(
  scenario: Scenario,
  users: ScenarioSuite["users"],
): Promise<ScenarioResult> {
  const network = preparePlatform()
  let state: ScenarioState = { ...scenario.state }
  let scope = state.scope ?? SCOPE
  let client: ApolloClient<unknown>
  let harness!: ReturnType<typeof fakeRuntime>
  let view: ReturnType<typeof render> | undefined
  let names!: ReturnType<typeof renderHook<string[], unknown>>
  let lastContact: Extract<ThreadEntry, { kind: "contactAction" }> | undefined
  let lastOutcome: Outcome | undefined
  const allHarnesses: ReturnType<typeof fakeRuntime>[] = []
  const errors: string[] = [],
    results: ScenarioResult["steps"] = []
  let unexpectedSupport = 0
  const deliberate = { support: 0, wallet: 0, contacts: 0, navigation: 0 }
  let verificationReads = 0
  let directoryReads = 0
  const contactRows = () =>
    (state.contacts ?? []).map((username) => ({
      __typename: "UserContact",
      id: username,
      username,
      alias: null,
      transactionsCount: 1,
    }))
  const seed = () => {
    client.writeQuery({
      query: ContactsDocument,
      data: { me: { __typename: "User", id: ownId, contacts: contactRows() } },
    })
    client.writeQuery({
      query: IDENTITY,
      data: { me: { __typename: "User", id: ownId, username: "scenario_user" } },
    })
    if (state.legacyIndex)
      client.writeQuery({
        query: INDEX,
        data: {
          assistantRecentUsers: JSON.stringify({ scope, names: state.legacyIndex }),
        },
      })
    for (const username of state.legacyLookups ?? [])
      client.writeQuery({
        query: WALLET,
        variables: { username },
        data: {
          accountDefaultWallet: {
            __typename: "UsdWallet",
            id: `${username}-wallet`,
            walletCurrency: "USD",
          },
        },
      })
    if (state.history?.length) {
      const edges = state.history.map((username, i) => ({
        __typename: "TransactionEdge",
        cursor: `row-${i}`,
        node: graphqlTx({
          id: `history-${i}`,
          createdAt: NOW_MS / 1000 - i,
          initiationVia: {
            __typename: "InitiationViaIntraLedger",
            counterPartyUsername: username,
            counterPartyWalletId: `${username}-wallet`,
          },
          settlementVia: {
            __typename: "SettlementViaIntraLedger",
            counterPartyUsername: username,
            counterPartyWalletId: `${username}-wallet`,
          },
        }),
      }))
      client.writeQuery({
        query: HomeAuthedDocument,
        data: {
          me: {
            __typename: "User",
            id: ownId,
            username: "scenario_user",
            language: "en",
            phone: null,
            createdAt: 1,
            email: null,
            npub: null,
            defaultAccount: {
              __typename: "ConsumerAccount",
              id: "account",
              level: "ONE",
              defaultWalletId: "my-usd",
              wallets: CASH_WALLETS,
              transactions: {
                __typename: "TransactionConnection",
                edges,
                pageInfo: {
                  __typename: "PageInfo",
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: "row-0",
                  endCursor: `row-${edges.length - 1}`,
                },
              },
            },
          },
        },
      })
    }
  }
  const verify = async (name: string) => {
    verificationReads += 1
    if (state.lookupFails) throw new Error("Scripted lookup outage")
    return state.unverifiedUsers?.includes(name) ? null : users[name]?.pubkey ?? null
  }
  jest.mocked(nip05.queryProfile).mockImplementation(async (handle) => {
    const pubkey = await verify(handle.split("@")[0])
    return pubkey ? { pubkey, relays: [] } : null
  })
  const mount = () => {
    jest.mocked(nativeVoiceInput.permission).mockResolvedValue("granted")
    jest
      .mocked(nativeVoiceInput.available)
      .mockResolvedValue(state.voiceAvailable !== false)
    platform.setOffline(state.offline === true)
    platform.setDisplay(state.displayCurrency ?? "USD")
    harness = fakeRuntime({ client, cacheScope: scope })
    allHarnesses.push(harness)
    harness.runtime.executor.openThread(harness.runtime.threadId)
    const failIfScripted = (
      service: NonNullable<ScenarioState["failServices"]>[number],
    ) => {
      if (state.failServices?.includes(service))
        throw new Error(`Scripted ${service} outage`)
    }
    harness.graphql.wallets.mockImplementation(async () => {
      failIfScripted("wallets")
      return [
        {
          ...CASH_WALLETS[0],
          balance: state.cashBalance === undefined ? 1234 : state.cashBalance,
        },
        wallet({
          __typename: "BTCWallet",
          id: "cash-btc",
          balance: 1000000,
          walletCurrency: WalletCurrency.Btc,
        }),
      ]
    })
    harness.graphql.searchUsernames.mockImplementation((hint: string) =>
      searchFlashUsernames(client, hint),
    )
    harness.graphql.contacts.mockImplementation(async () => contactRows())
    harness.graphql.accountDefaultWallet.mockImplementation(async (name: string) => {
      failIfScripted("accountDefaultWallet")
      return accountsOf(Object.keys(users))(name)
    })
    harness.graphql.realtimePrice.mockImplementation(async (currency: string) => {
      failIfScripted("realtimePrice")
      return currency === "JMD" ? JMD_PRICE : USD_PRICE
    })
    harness.graphql.transactions.mockImplementation(async () => {
      failIfScripted("transactions")
      return page(
        (state.history ?? []).map((username, i) =>
          graphqlTx({
            id: `history-${i}`,
            createdAt: NOW_MS / 1000 - i,
            initiationVia: {
              __typename: "InitiationViaIntraLedger",
              counterPartyUsername: username,
              counterPartyWalletId: `${username}-wallet`,
            },
            settlementVia: {
              __typename: "SettlementViaIntraLedger",
              counterPartyUsername: username,
              counterPartyWalletId: `${username}-wallet`,
            },
          }),
        ),
      )
    })
    harness.btcRail.getBalanceSats.mockImplementation(async () =>
      state.btcState && state.btcState !== "ok"
        ? { state: state.btcState }
        : { state: "ok", sats: state.btcSats ?? 1000000 },
    )
    harness.actions.lnUsdInvoiceCreate.mockImplementation(async () => ({
      paymentRequest: bolt11({ id: "scenario-conversion", expirySeconds: 300 }),
    }))
    harness.btcRail.probeFee.mockResolvedValue({ fee: 0, err: null })
    harness.btcRail.createInvoice.mockImplementation(async (sats: number) => ({
      paymentRequest: bolt11({ id: "scenario-btc-conversion", sats, expirySeconds: 300 }),
      fee: 0,
    }))
    harness.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 0, errors: [] } },
    })
    if (state.recent?.length) harness.runtime.recentUsers.remember(state.recent)
    platform.setRuntime(harness.runtime)
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <FeatureFlagContext.Provider
        value={{
          deviceAccountEnabled: false,
          bridgeTopupEnabled: false,
          cashuCardUsdEnabled: false,
          assistantEnabled: true,
          assistantVoice: true,
          assistantVoiceReplies: false,
          assistantServerFallback: false,
          assistantOnDeviceModel: false,
        }}
      >
        <ApolloProvider client={client}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </ApolloProvider>
      </FeatureFlagContext.Provider>
    )
    names = renderHook(
      () => useKnownFlashUsers("flashapp.me", harness.runtime.recentUsers),
      { wrapper },
    )
    if (scenario.layer === "screen") view = render(<AskFlashScreen />, { wrapper })
  }
  const readContact = async (
    entry: Extract<ThreadEntry, { kind: "contactAction" }>,
    selected?: string,
  ): Promise<Outcome> => {
    lastContact = entry
    const query = selected ?? entry.username
    let lookup: Awaited<ReturnType<typeof lookupFlashUsername<string>>>
    try {
      lookup = await lookupFlashUsername(query, names.result.current, {
        verify,
        search: (hint) => searchFlashUsernames(client, hint),
      })
    } catch {
      if (view)
        await waitFor(() =>
          expect(
            within(
              view!.getAllByTestId(`ask-flash-contact-${entry.operation}`).at(-1)!,
            ).getByText(LL.AskFlashActions.contactError()),
          ).toBeTruthy(),
        )
      return { kind: "contact", query, operation: entry.operation, lookup: "error" }
    }
    if (lookup.kind === "exact") {
      const match = lookup.match
      if (view)
        await waitFor(() =>
          expect(
            harness.runtime.transcript.get().entries.find((r) => r.id === entry.id),
          ).toMatchObject({ resolvedUsername: match.username }),
        )
      else {
        harness.runtime.transcript.rememberContact(entry.id, match.username)
        act(() => harness.runtime.recentUsers.remember([match.username]))
      }
      return {
        kind: "contact",
        query,
        operation: entry.operation,
        lookup: "exact",
        usernames: [match.username],
      }
    }
    const matches = lookup.matches
    if (view)
      await waitFor(() => {
        const card = within(
          view!.getAllByTestId(`ask-flash-contact-${entry.operation}`).at(-1)!,
        )
        expect(card.queryAllByTestId("ask-flash-contact-suggestion")).toHaveLength(
          matches.length,
        )
        if (!matches.length)
          expect(card.getByText(LL.AskFlashActions.contactNotFound())).toBeTruthy()
      })
    return {
      kind: "contact",
      query,
      operation: entry.operation,
      lookup: matches.length ? "suggestions" : "missing",
      usernames: matches.map((r) => r.username),
    }
  }
  const outcome = async (): Promise<Outcome> => {
    const entry = harness.runtime.transcript.get().entries.at(-1)
    if (!entry) return { kind: "empty" }
    if (entry.kind === "contactAction") return readContact(entry)
    if (entry.kind === "card") {
      const card = entry.card as {
        type?: string
        payeeUsername?: string
        reason?: string
        toWallet?: string
        prompt?: string
        options?: { id: string }[]
      }
      const call = harness.runTool.mock.calls.at(-1)?.[0] as ToolCall | undefined
      return {
        kind: "card",
        cardType: card.type,
        username: card.payeeUsername,
        intent: call?.intent,
        amount: (call?.args as { amount?: string })?.amount,
        currency: (call?.args as { currency?: string })?.currency,
        inputOrigin: entry.inputOrigin ?? "text",
        reason: card.reason,
        toWallet: card.toWallet,
        prompt: card.prompt,
        ...(view && card.type === "confirmPayment"
          ? {
              title: within(
                view.getAllByTestId("assistant-card-confirm").at(-1)!,
              ).getByRole("header").props.children,
            }
          : {}),
        ...(card.options
          ? {
              usernames: card.options.map((option) => option.id.replace(/^contact:/, "")),
            }
          : {}),
      }
    }
    if (entry.kind === "help") return { kind: entry.kind, topic: entry.topic }
    if (entry.kind === "screen")
      return { kind: entry.kind, destination: entry.destination }
    if (entry.kind === "reply") return { kind: entry.kind, replyKey: entry.replyKey }
    if (entry.kind === "address")
      return { kind: entry.kind, username: entry.address, stale: entry.stale }
    if (entry.kind === "balances") {
      const cash = entry.payload.balances.find((row) => row.wallet === "USD")
      const btc = entry.payload.balances.find((row) => row.wallet === "BTC")
      return {
        kind: entry.kind,
        stale: entry.stale,
        cashBalance: cash?.state === "ok" ? cash.balance.amount : null,
        btcState: btc?.wallet === "BTC" ? btc.state : undefined,
        btcSats: btc?.state === "ok" ? btc.balance.amount : null,
      }
    }
    if (entry.kind === "transactions")
      return {
        kind: entry.kind,
        stale: entry.stale,
        transactionIds: entry.payload.transactions.map((row) => row.id),
      }
    if (entry.kind === "price")
      return { kind: entry.kind, currency: entry.payload.currency }
    return { kind: entry.kind, ...("stale" in entry ? { stale: entry.stale } : {}) }
  }
  const ask = async (step: Extract<ScenarioStep, { ask: string }>) => {
    if (view) {
      if (step.origin === "voice") {
        const before = harness.runtime.transcript.get().entries.length
        const subscribe = jest.mocked(nativeVoiceInput.subscribe)
        const listener = subscribe.mock.calls.at(-1)?.[0]
        if (!listener) throw new Error("Voice input did not subscribe")
        await waitFor(() =>
          expect(
            view?.getByTestId("ask-flash-talk").props.accessibilityState.disabled,
          ).toBe(false),
        )
        await act(async () => {
          fireEvent(view!.getByTestId("ask-flash-talk"), "responderGrant")
        })
        const id = jest.mocked(nativeVoiceInput.start).mock.calls.at(-1)?.[0]
        if (!id) throw new Error("Voice session did not start")
        const emit = (type: VoiceEvent["type"], text?: string) =>
          listener({ sessionId: id, type, text })
        act(() => {
          emit("started")
          emit("interim", step.ask)
        })
        expect(view.getByTestId("ask-flash-input").props.value).toBe(step.ask)
        expect(harness.runtime.transcript.get().entries).toHaveLength(before)
        act(() => {
          emit("final", step.ask)
          listener({ sessionId: "stale-session", type: "final", text: "Pay bob 99 USD" })
        })
        expect(harness.runtime.transcript.get().entries).toHaveLength(before)
        await act(async () => {
          fireEvent(view!.getByTestId("ask-flash-talk"), "responderRelease")
          emit("end")
        })
        act(() => {
          emit("final", "Pay bob 99 USD")
          emit("end")
        })
        expect(
          harness.runtime.transcript
            .get()
            .entries.slice(before)
            .filter((row) => row.kind === "user"),
        ).toHaveLength(1)
      } else {
        fireEvent.changeText(view.getByTestId("ask-flash-input"), step.ask)
        await act(async () => {
          fireEvent.press(view!.getByTestId("ask-flash-send"))
        })
      }
    } else {
      await act(async () => {
        harness.runtime.transcript.append([{ kind: "user", text: step.ask }])
        const entries = await answerUtterance(
          harness.runtime,
          step.ask,
          env({
            isOffline: state.offline === true,
            knownUsernames: names.result.current,
            inputOrigin: step.origin ?? "text",
            displayCurrency: state.displayCurrency ?? "USD",
            displaySymbol: state.displayCurrency === "JMD" ? "J$" : "$",
          }),
        )
        harness.runtime.transcript.append(entries)
      })
    }
    return outcome()
  }
  const reads = () =>
    directoryReads +
    verificationReads +
    allHarnesses.reduce(
      (n, h) =>
        n +
        Object.values(h.graphql).reduce((s, fn) => s + fn.mock.calls.length, 0) +
        h.btcRail.getBalanceSats.mock.calls.length +
        h.btcRail.listPayments.mock.calls.length,
      0,
    )
  const changeContact = async (
    step: Extract<ScenarioStep, { contactAction: string }>,
  ) => {
    const currentView = view
    if (!currentView) throw new Error("Contact changes require a mounted screen")
    const before = platform.publish.mock.calls.length
    expect(before).toBe(deliberate.contacts)
    const contactsBefore = platform.chat().contactsEvent
    if (step.result !== "cancelled") deliberate.contacts += 1
    if (step.result === "rejected")
      platform.publish.mockImplementationOnce(() => [
        Promise.reject(new Error("Scripted relay rejection")),
      ])
    const action = currentView.getAllByTestId("ask-flash-contact-action").at(-1)
    if (!action) throw new Error("No contact action was offered")
    await act(async () => {
      fireEvent.press(action)
    })
    if (step.contactAction === "remove") {
      const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]
      if (step.result === "cancelled") {
        expect(buttons?.some((button) => button.style === "cancel")).toBe(true)
        await act(async () =>
          buttons?.find((button) => button.style === "cancel")?.onPress?.(),
        )
        expect(platform.publish.mock.calls).toHaveLength(before)
        expect(platform.chat().contactsEvent).toEqual(contactsBefore)
        return
      }
      const confirm = buttons?.find((button) => button.style === "destructive")?.onPress
      if (!confirm) throw new Error("Missing removal confirmation")
      await act(async () => confirm())
    }
    await waitFor(() => expect(platform.publish.mock.calls).toHaveLength(before + 1))
    if (step.result === "rejected") {
      await waitFor(() =>
        expect(
          within(
            currentView.getAllByTestId(`ask-flash-contact-${step.contactAction}`).at(-1)!,
          ).getByText(LL.AskFlashActions.contactError()),
        ).toBeTruthy(),
      )
      expect(platform.chat().contactsEvent).toEqual(contactsBefore)
      return
    }
    const present = platform
      .chat()
      .contactsEvent?.tags.some(
        (tag) => tag[0] === "p" && tag[1] === users[step.username].pubkey,
      )
    expect(present).toBe(step.contactAction === "add")
  }
  const correctUsername = async (text: string) => {
    if (!view || !lastContact)
      throw new Error("Correction requires a rendered contact card")
    const card = within(
      view.getAllByTestId(`ask-flash-contact-${lastContact.operation}`).at(-1)!,
    )
    fireEvent.changeText(card.getByTestId("ask-flash-contact-input"), text)
    const searchButton = card.getByTestId("ask-flash-contact-search")
    await act(async () => fireEvent.press(searchButton))
    return readContact(lastContact, text.trim().replace(/^@/, "").toLowerCase())
  }
  const restartSession = (nextScope?: string) => {
    cleanup()
    const saved = JSON.parse(JSON.stringify(client.cache.extract()))
    client.stop()
    if (nextScope) {
      scope = nextScope
      state = { offline: state.offline }
    }
    client = makeClient(() => {
      directoryReads += 1
      if (state.failServices?.includes("searchUsernames"))
        throw new Error("Search unavailable")
      return state.directoryMatches ?? []
    })
    client.cache.restore(saved)
    if (nextScope) {
      client.writeQuery({
        query: ContactsDocument,
        data: { me: { __typename: "User", id: "account-b", contacts: [] } },
      })
      platform.setChat({ contactsEvent: chatEvent([], users), profileMap: new Map() })
    }
    view = undefined
    lastContact = undefined
    lastOutcome = undefined
    mount()
  }
  try {
    client = makeClient(() => {
      directoryReads += 1
      if (state.failServices?.includes("searchUsernames"))
        throw new Error("Search unavailable")
      return state.directoryMatches ?? []
    })
    seed()
    platform.setChat({
      contactsEvent: chatEvent(state.chatContacts ?? [], users),
      profileMap: new Map(
        (state.chatContacts ?? []).map((name) => [
          users[name].pubkey,
          { nip05: `${name}@flashapp.me` },
        ]),
      ),
    })
    mount()
    await act(async () => undefined)
    for (const step of scenario.steps) {
      const beforeReads = reads()
      const row: ScenarioResult["steps"][number] = { input: step }
      results.push(row)
      try {
        if ("ask" in step) row.actual = await ask(step)
        if ("correctUsername" in step)
          row.actual = await correctUsername(step.correctUsername)
        if ("fixture" in step) state = { ...state, ...step.fixture }
        if ("voiceFailure" in step) await failVoice(view, harness, step.voiceFailure)
        if ("openScreen" in step) {
          openScreen(view, step.openScreen)
          deliberate.navigation += 1
        }
        if ("assertReads" in step)
          expect(serviceReads(allHarnesses, verificationReads)).toMatchObject(
            step.assertReads,
          )
        if ("voiceUnavailable" in step) await checkVoiceUnavailable(view)
        if ("select" in step && lastOutcome?.cardType === "clarification") {
          if (!view) throw new Error("Payment selection requires screen replay")
          const index = lastOutcome.usernames?.indexOf(step.select) ?? -1
          if (index < 0) throw new Error("Payment selection was not offered")
          const selectedButton = within(
            view.getAllByTestId("assistant-card-clarification").at(-1)!,
          ).getByTestId(`assistant-card-option-${index}`)
          await act(async () => fireEvent.press(selectedButton))
          row.actual = await outcome()
        } else if ("select" in step) {
          if (
            !lastContact ||
            lastOutcome?.lookup !== "suggestions" ||
            !lastOutcome.usernames?.includes(step.select)
          )
            throw new Error("Selection was not offered")
          if (view) {
            const buttons = within(
              view.getAllByTestId(`ask-flash-contact-${lastContact.operation}`).at(-1)!,
            ).getAllByTestId("ask-flash-contact-suggestion")
            const index = lastOutcome.usernames.indexOf(step.select)
            await act(async () => fireEvent.press(buttons[index]))
          }
          row.actual = await readContact(lastContact, step.select)
        }
        if ("restart" in step || "switchAccount" in step) {
          restartSession("switchAccount" in step ? step.switchAccount : undefined)
          await act(async () => undefined)
        }
        if ("offline" in step) {
          state = { ...state, offline: step.offline }
          platform.setOffline(step.offline)
          names.rerender({})
          if (view)
            view.rerender(
              <ApolloProvider client={client}>
                <ThemeProvider theme={theme}>
                  <AskFlashScreen />
                </ThemeProvider>
              </ApolloProvider>,
            )
        }
        if ("contactAction" in step) await changeContact(step)
        if ("openSupport" in step) {
          const before = platform.openSupport.mock.calls.length
          expect(before).toBe(deliberate.support)
          deliberate.support += 1
          const buttons = view!
            .queryAllByTestId("ask-flash-help-action")
            .concat(view!.queryAllByTestId("ask-flash-screen-action"))
            .concat(view!.queryAllByTestId("ask-flash-contact-support"))
          expect(platform.openSupport).toHaveBeenCalledTimes(before)
          fireEvent.press(buttons.at(-1)!)
          expect(platform.openSupport).toHaveBeenCalledTimes(before + 1)
        }
        if ("toggleWallet" in step) {
          const before = platform.walletRequest.mock.calls.length
          expect(before).toBe(deliberate.wallet)
          deliberate.wallet += 1
          fireEvent.press(view!.getAllByTestId("ask-flash-bitcoin-wallet-toggle").at(-1)!)
          expect(platform.walletRequest).toHaveBeenCalledTimes(before + 1)
          expect(platform.walletRequest).toHaveBeenLastCalledWith(step.toggleWallet)
        }
        if ("expect" in step) {
          row.expected = step.expect
          if (
            !["Assistant.unknownIntent", "Assistant.notYetAvailable"].includes(
              step.expect.replyKey ?? "",
            ) &&
            ["Assistant.unknownIntent", "Assistant.notYetAvailable"].includes(
              row.actual?.replyKey ?? "",
            )
          )
            unexpectedSupport += 1
          expect(row.actual).toMatchObject(step.expect)
          // eslint-disable-next-line require-atomic-updates -- Each step completes before updating its follow-up context.
          lastOutcome = row.actual
        }
        assertSideEffects(allHarnesses, deliberate, network)
        if (state.offline && ("ask" in step || "select" in step))
          expect(reads()).toBe(beforeReads)
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error)
        errors.push(row.error)
        break // Later steps depend on this step's state.
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    cleanup()
    allHarnesses.forEach((h) => h.runtime.executor.leaveThread(h.runtime.threadId))
    client!.stop()
    jest.restoreAllMocks()
  }
  return {
    id: scenario.id,
    category: scenario.category,
    layer: scenario.layer,
    supported: scenario.supported,
    split: scenario.split,
    passed: !errors.length,
    steps: results,
    unexpectedSupport,
    dispatches: dispatchCount(allHarnesses),
    errors,
  }
}
