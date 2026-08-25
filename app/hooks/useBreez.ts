import { useContext } from "react"
import { BreezContext, type BreezInterface } from "@app/contexts/BreezContext"

/**
 * The only way anything in the app reads BreezContext — no consumer calls
 * `useContext(BreezContext)` directly. It returns the context's own interface
 * rather than a local copy of it, so a field added to the provider is reachable
 * here the moment it is added.
 */
export const useBreez = (): BreezInterface => useContext(BreezContext)
