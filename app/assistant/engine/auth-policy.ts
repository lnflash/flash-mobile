import type { PreparedAction } from "../registry/types"

/** How the user asked for the action: in text (typed or tapped), or by voice. */
export const AUTH_ORIGINS = ["text", "voice"] as const

export type AuthOrigin = (typeof AUTH_ORIGINS)[number]

export const isAuthOrigin = (value: unknown): value is AuthOrigin =>
  typeof value === "string" && (AUTH_ORIGINS as readonly string[]).includes(value)

export type AuthRequirement = "none" | "biometric"

/**
 * Whether a Confirm needs the auth gate (auth-gate.ts) before it executes,
 * decided at Confirm time (docs/ai-assistant-tool-registry.md §5, "Auth
 * policy"; ENG-684 decision 1, 2026-10-13).
 *
 * One function on purpose: an amount threshold or a user setting ("require
 * Face ID for assistant payments") later is a change here, not a redesign.
 */
export type AuthPolicy = (action: PreparedAction, origin: AuthOrigin) => AuthRequirement

/**
 * v1: the confirm card is the same review-and-confirm the send screens give,
 * so a text-initiated action needs nothing more, as a send from the screens
 * does not. A voice-initiated one needs biometrics, since a bystander could
 * speak a send into an unlocked phone (Phase 4). Only an origin known to be
 * text skips the gate: anything else gets the stricter answer.
 */
export const authPolicy: AuthPolicy = (_action, origin) =>
  origin === "text" ? "none" : "biometric"
