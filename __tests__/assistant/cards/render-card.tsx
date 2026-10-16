// A render harness for the card specs: the theme, English strings and a fake
// executor. Not a spec itself.
import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { act, render } from "@testing-library/react-native"

import type { CardActions } from "@app/assistant/cards/card-actions"
import type { CanConfirm, ConfirmResult } from "@app/assistant/engine/executor"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

loadLocale("en")

/** The English dictionary the cards read their strings from. */
export const en = i18nObject("en")

export const renderCard = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={createTheme({})}>{ui}</ThemeProvider>)

/** An executor's two card-facing calls, and the thread's two callbacks. */
export const fakeActions = ({
  can = { enabled: true, state: "armed" },
  result = {
    kind: "executed",
    actionId: "action",
    outcome: { status: "succeeded" },
  },
}: { can?: CanConfirm; result?: ConfirmResult } = {}) => {
  const actions = {
    canConfirm: jest.fn(async (): Promise<CanConfirm> => can),
    executePreparedAction: jest.fn(async (): Promise<ConfirmResult> => result),
    reprepare: jest.fn(),
    onResult: jest.fn(),
  }
  return actions as typeof actions & CardActions
}

/** Let a card's canConfirm answer land, inside act. */
export const flush = () =>
  act(async () => {
    await Promise.resolve()
  })
