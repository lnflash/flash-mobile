import {
  clearSendFlowOpened,
  markSendFlowOpened,
  takeSendFlowOpenToConfirmMs,
} from "@app/utils/send-open-to-confirm"

beforeEach(() => {
  clearSendFlowOpened()
})

describe("send flow open-to-confirm timing", () => {
  it("measures from the open to the confirmed send", () => {
    markSendFlowOpened(1_000)

    expect(takeSendFlowOpenToConfirmMs(43_500)).toBe(42_500)
  })

  it("reports one open once", () => {
    markSendFlowOpened(1_000)
    takeSendFlowOpenToConfirmMs(2_000)

    expect(takeSendFlowOpenToConfirmMs(3_000)).toBeUndefined()
  })

  it("reports nothing for a flow that was not opened, or was left", () => {
    expect(takeSendFlowOpenToConfirmMs(5_000)).toBeUndefined()

    markSendFlowOpened(1_000)
    clearSendFlowOpened()
    expect(takeSendFlowOpenToConfirmMs(5_000)).toBeUndefined()
  })

  it("restarts the clock when the flow is opened again", () => {
    markSendFlowOpened(1_000)
    markSendFlowOpened(9_000)

    expect(takeSendFlowOpenToConfirmMs(10_000)).toBe(1_000)
  })

  it("reads the clock itself when no time is given", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(100)
    markSendFlowOpened()
    now.mockReturnValue(350)

    expect(takeSendFlowOpenToConfirmMs()).toBe(250)
    now.mockRestore()
  })
})
