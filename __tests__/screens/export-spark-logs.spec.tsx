/**
 * ExportSparkLogsSetting — the Settings row that shares the Spark debug log.
 *
 * The log buffer rotates its CSV by size (ENG-728), so the row shares the log
 * files that exist: one as `url`, two as `urls`. iOS takes bare paths; Android
 * takes file:// URLs.
 */

import * as React from "react"
import { Platform } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

const mockShareOpen = jest.fn()
jest.mock("react-native-share", () => ({
  __esModule: true,
  default: { open: (options: unknown) => mockShareOpen(options) },
}))
const mockGetLogFilePaths = jest.fn()
jest.mock("@app/utils/breez-sdk/log-buffer", () => ({
  getLogFilePaths: () => mockGetLogFilePaths(),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import { ExportSparkLogsSetting } from "@app/screens/settings-screen/settings/export-spark-logs"

loadLocale("en")
const en = i18nObject("en")

const CURRENT = "/data/Documents/flash-spark-debug-logs.csv"
const PREVIOUS = "/data/Documents/flash-spark-debug-logs.1.csv"

// Presses the row on `os` with `paths` on disk and waits for the export to end:
// the row shows a spinner in place of its title while the export runs.
const exportOn = async (os: "ios" | "android", paths: string[]) => {
  mockGetLogFilePaths.mockResolvedValue(paths)
  const platform = jest.replaceProperty(Platform, "OS", os)
  try {
    const screen = render(
      <ThemeProvider theme={createTheme({})}>
        <ExportSparkLogsSetting />
      </ThemeProvider>,
    )
    fireEvent.press(screen.getByText(en.common.exportSparkLogs()))
    await screen.findByText(en.common.exportSparkLogs())
  } finally {
    platform.restore()
  }
  expect(mockGetLogFilePaths).toHaveBeenCalledTimes(1)
}

const shareOptions = (files: { url: string } | { urls: string[] }) => ({
  title: "flash-spark-debug-logs",
  ...files,
  type: "text/csv",
  failOnCancel: false,
})

beforeEach(() => {
  mockShareOpen.mockReset().mockResolvedValue({ success: true, message: "" })
  mockGetLogFilePaths.mockReset()
})

describe("ExportSparkLogsSetting", () => {
  it("shares the one log file by its bare path on iOS", async () => {
    await exportOn("ios", [CURRENT])
    expect(mockShareOpen).toHaveBeenCalledTimes(1)
    expect(mockShareOpen).toHaveBeenCalledWith(shareOptions({ url: CURRENT }))
  })

  it("shares both generations by their bare paths on iOS", async () => {
    await exportOn("ios", [CURRENT, PREVIOUS])
    expect(mockShareOpen).toHaveBeenCalledTimes(1)
    expect(mockShareOpen).toHaveBeenCalledWith(
      shareOptions({ urls: [CURRENT, PREVIOUS] }),
    )
  })

  it("shares the one log file as a file:// URL on Android", async () => {
    await exportOn("android", [CURRENT])
    expect(mockShareOpen).toHaveBeenCalledTimes(1)
    expect(mockShareOpen).toHaveBeenCalledWith(shareOptions({ url: `file://${CURRENT}` }))
  })

  it("shares both generations as file:// URLs on Android", async () => {
    await exportOn("android", [CURRENT, PREVIOUS])
    expect(mockShareOpen).toHaveBeenCalledTimes(1)
    expect(mockShareOpen).toHaveBeenCalledWith(
      shareOptions({ urls: [`file://${CURRENT}`, `file://${PREVIOUS}`] }),
    )
  })

  it("opens no share sheet when there is no log file", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await exportOn("android", [])
      expect(mockShareOpen).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith("No log file found")
    } finally {
      warn.mockRestore()
    }
  })
})
