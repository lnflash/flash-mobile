import React from "react"

import SendBitcoinDestinationScreen from "@app/screens/send-bitcoin-screen/send-bitcoin-destination-screen"
import { act, render } from "@testing-library/react-native"
import {
  clearSendFlowOpened,
  takeSendFlowOpenToConfirmMs,
} from "@app/utils/send-open-to-confirm"
import { ContextForScreen } from "./helper"

const sendBitcoinDestination = {
  name: "sendBitcoinDestination",
  key: "sendBitcoinDestination",
  params: {
    payment: "",
    username: "",
  },
} as const

it("SendScreen Destination", async () => {
  render(
    <ContextForScreen>
      <SendBitcoinDestinationScreen
        route={sendBitcoinDestination}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={{} as any}
      />
    </ContextForScreen>,
  )
  await act(async () => {})
})

// ENG-687: the classic send flow's open-to-confirm baseline starts here.
describe("send flow open-to-confirm mark", () => {
  const renderScreen = () =>
    render(
      <ContextForScreen>
        <SendBitcoinDestinationScreen
          route={sendBitcoinDestination}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigation={{} as any}
        />
      </ContextForScreen>,
    )

  beforeEach(() => {
    clearSendFlowOpened()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("marks the flow open when the screen mounts", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000)

    const screen = renderScreen()
    await act(async () => {})

    // A send confirmed 4 s after the screen opened reports 4 s.
    expect(takeSendFlowOpenToConfirmMs(5_000)).toBe(4_000)
    screen.unmount()
  })

  it("clears the mark when the screen unmounts, so a later send elsewhere reports nothing", async () => {
    const screen = renderScreen()
    await act(async () => {})

    screen.unmount()

    expect(takeSendFlowOpenToConfirmMs(5_000)).toBeUndefined()
  })
})
