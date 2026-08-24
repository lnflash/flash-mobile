import { TurboModuleRegistry, NativeModules } from "react-native"

interface SourceCodeTurboModule {
  getConstants(): {
    scriptURL: string
  }
}

// this is used for local development
// will typically return localhost
const scriptHostname = (): string => {
  const turboModule =
    TurboModuleRegistry.getEnforcing<SourceCodeTurboModule>("SourceCode")
  const turboScriptURL = turboModule?.getConstants?.()?.scriptURL

  const { scriptURL } = NativeModules.SourceCode || {}
  const urlToUse = turboScriptURL || scriptURL

  if (!urlToUse) {
    return "localhost"
  }

  const parts = urlToUse.split("://")
  if (parts.length < 2) {
    return "localhost"
  }

  const hostPart = parts[1]?.split(":")[0]
  return hostPart ?? "localhost"
}

export const possibleGaloyInstanceNames = [
  "Main",
  "Staging",
  "Test",
  "Sandbox",
  "Development",
  "Local",
  "Custom",
] as const
export type GaloyInstanceName = (typeof possibleGaloyInstanceNames)[number]

export type StandardInstance = {
  id: "Main" | "Staging" | "Test" | "Sandbox" | "Development" | "Local"
}

export type CustomInstance = {
  id: "Custom"
  name: string
  graphqlUri: string
  graphqlWsUri: string
  authUrl: string
  posUrl: string
  lnAddressHostname: string
  blockExplorer: string
  relayUrl: string
}

export type GaloyInstanceInput = StandardInstance | CustomInstance

export type GaloyInstance = {
  id: GaloyInstanceName
  name: string
  graphqlUri: string
  graphqlWsUri: string
  authUrl: string
  posUrl: string
  lnAddressHostname: string
  blockExplorer: string
  relayUrl: string
  /**
   * The lightning node pubkeys this instance mints bolt11 invoices from.
   *
   * Consumed by the fee-from-amount disclosure (#694): an invoice whose payee
   * is one of these nodes settles inside the custodian, so a probed $0.00 fee
   * is genuine and the "deducted from the amount" caveat must stay silent.
   * `globals.nodesIds` would be the natural source, but it is empty on prod
   * and test (verified live 2026-08-24), so the ids live here.
   *
   * To populate or verify an entry: mint any receive invoice on the instance
   * (the app's receive screen works), then decode it —
   *   `require("bolt11").decode(paymentRequest).payeeNodeKey`
   * — and pin that pubkey. An empty list only disables the suppression; the
   * disclosure itself still shows.
   */
  lnNodePubkeys?: readonly string[]
}

export const resolveGaloyInstanceOrDefault = (
  input: GaloyInstanceInput,
): GaloyInstance => {
  if (input.id === "Custom") {
    return input
  }

  const instance = GALOY_INSTANCES.find((instance) => instance.id === input.id)

  // branch only to please typescript. Array,find have T | undefined as return type
  if (instance === undefined) {
    console.error("instance not found") // should not happen
    return GALOY_INSTANCES[0]
  }

  return instance
}

export const GALOY_INSTANCES: readonly GaloyInstance[] = [
  {
    id: "Main",
    name: "Flash",
    graphqlUri: "https://api.flashapp.me/graphql",
    graphqlWsUri: "wss://ws.flashapp.me/graphql",
    authUrl: "https://api.flashapp.me",
    posUrl: "https://pay.flashapp.me",
    lnAddressHostname: "flashapp.me",
    relayUrl: "wss://relay.flashapp.me",
    blockExplorer: "https://mempool.space/tx/",
    // Verified 2026-08-24: five receive invoices minted live on prod via the
    // LNURL-pay callback (`https://ibex.flashapp.me/pay/lnurl/<user>`) across
    // two different accounts and amounts from 1 to 50,000 sats ALL decode to
    // this payee — alias IBEX_Ops1 on mempool.space. If IBEX ever mints prod
    // invoices from an additional node, append it here (recipe on the type
    // field); a missing node only re-shows the caveat on Flash-to-Flash
    // sends, it never hides a real fee.
    lnNodePubkeys: ["03501a74753e0f6ae270a1e4e2ffbbc37f7a796360e650c1121c18e116b22ac106"],
  },
  {
    id: "Staging",
    name: "Staging",
    graphqlUri: "https://api.staging.flashapp.me/graphql",
    graphqlWsUri: "wss://ws.staging.flashapp.me/graphql",
    authUrl: "https://api.staging.flashapp.me",
    posUrl: "http://pay.staging.flashapp.me",
    lnAddressHostname: "staging.flashapp.me",
    blockExplorer: "https://mempool.space/signet/tx/",
    relayUrl: "wss://relay.test.flashapp.me",
  },
  {
    id: "Test",
    name: "Test",
    graphqlUri: "https://api.test.flashapp.me/graphql",
    graphqlWsUri: "wss://ws.test.flashapp.me/graphql",
    authUrl: "https://api.test.flashapp.me",
    posUrl: "http://pay.test.flashapp.me",
    lnAddressHostname: "test.flashapp.me",
    blockExplorer: "https://mempool.space/signet/tx/",
    relayUrl: "wss://relay.test.flashapp.me",
    // Verified 2026-08-24: a freshly minted Test-instance USD invoice decodes
    // to this payee (IBEX_SB on mempool.space), and probing it via
    // lnUsdInvoiceFeeProbe returned a set fee of 0.
    lnNodePubkeys: ["02004d8933df4f002fa95d8c37ca43eb9c175d310aad55cc6d442e4accc3740029"],
  },
  {
    id: "Sandbox",
    name: "Sandbox",
    graphqlUri: "https://sandbox.flashapp.me/graphql",
    graphqlWsUri: "wss://ws.sandbox.flashapp.me/graphql",
    authUrl: "https://sandbox.flashapp.me",
    posUrl: "http://pay.sandbox.flashapp.me",
    lnAddressHostname: "sandbox.flashapp.me",
    blockExplorer: "https://mempool.space/signet/tx/",
    relayUrl: "wss://relay.staging.flashapp.me",
  },
  {
    id: "Development",
    name: "Development",
    graphqlUri: "https://api.development.flashapp.me:8080/graphql",
    graphqlWsUri: "ws://ws.development.flashapp.me:4000/graphql",
    authUrl: "https://api.development.flashapp.me:8080",
    posUrl: "http://development.flashapp.me:3000",
    lnAddressHostname: "development.flashapp.me:3000",
    blockExplorer: "https://mempool.space/signet/tx/",
    relayUrl: "wss://relay.test.flashapp.me",
  },
  {
    id: "Local",
    name: "Local",
    graphqlUri: `http://${scriptHostname()}:4002/graphql`,
    graphqlWsUri: `ws://${scriptHostname()}:4002/graphqlws`,
    authUrl: `http://${scriptHostname()}:4002`,
    posUrl: `http://${scriptHostname()}:3000`,
    lnAddressHostname: `${scriptHostname()}:3000`,
    blockExplorer: "https://mempool.space/signet/tx/",
    relayUrl: "wss://relay.test.flashapp.me",
  },
] as const
