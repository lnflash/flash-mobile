/* eslint-disable camelcase */
import * as fs from "fs"
import * as path from "path"
import { Platform } from "react-native"
import { getAnalytics } from "@react-native-firebase/analytics"

jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: {
    getSystemVersion: jest.fn(() => "26.0.1"),
    getDeviceId: jest.fn(() => "iPhone17,1"),
  },
}))

import { AssistantCoverageParams, logAssistantCoverage } from "@app/utils/analytics"
import {
  COVERAGE_REPORTED_KEY,
  coverageOf,
  DeviceProfile,
  reportOnDeviceModelCoverage,
} from "@app/utils/on-device-model-coverage"

// The one-time on-device model coverage event (ENG-689, decision 4;
// docs/ai-assistant-tool-registry.md §7.1): once per install, app-wide,
// whatever the assistant's flag, with device capability only.

const memoryStorage = () => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value)
    }),
  }
}

const ios = (deviceId: string, osVersion = "26.0"): DeviceProfile => ({
  platform: "ios",
  osVersion,
  deviceId,
})

describe("coverageOf: whether a device could run an on-device model", () => {
  const table: [string, DeviceProfile, Partial<AssistantCoverageParams>][] = [
    [
      "iPhone 15 Pro on iOS 26",
      ios("iPhone16,1"),
      { onDeviceModelAvailable: true, deviceClass: "iPhone16", osMajorVersion: 26 },
    ],
    [
      "iPhone 15 Pro Max on iOS 26.1",
      ios("iPhone16,2", "26.1"),
      { onDeviceModelAvailable: true },
    ],
    [
      "iPhone 15 (no Apple Intelligence) on iOS 26",
      ios("iPhone15,4"),
      { onDeviceModelAvailable: false, deviceClass: "iPhone15" },
    ],
    ["iPhone 14 Pro on iOS 26", ios("iPhone15,2"), { onDeviceModelAvailable: false }],
    [
      "iPhone 16 on iOS 26",
      ios("iPhone17,3"),
      { onDeviceModelAvailable: true, deviceClass: "iPhone17" },
    ],
    ["iPhone 16e on iOS 26", ios("iPhone17,5"), { onDeviceModelAvailable: true }],
    [
      "a later iPhone on iOS 27",
      ios("iPhone19,1", "27.0"),
      { onDeviceModelAvailable: true },
    ],
    [
      "iPhone 16 Pro on iOS 18 (no Foundation Models)",
      ios("iPhone17,1", "18.5"),
      { onDeviceModelAvailable: false, osMajorVersion: 18 },
    ],
    [
      "an iPad, counted as not available",
      ios("iPad16,3"),
      { onDeviceModelAvailable: false, deviceClass: "iPad16" },
    ],
    [
      "the simulator",
      ios("arm64"),
      { onDeviceModelAvailable: false, deviceClass: "other" },
    ],
    [
      "an unreadable iOS version",
      ios("iPhone17,1", "beta"),
      { onDeviceModelAvailable: false, osMajorVersion: null },
    ],
    [
      "Android, which JavaScript cannot ask about AICore",
      { platform: "android", osVersion: "15", deviceId: "husky" },
      {
        onDeviceModelAvailable: false,
        platform: "android",
        osMajorVersion: 15,
        deviceClass: "android",
      },
    ],
    [
      "another platform",
      { platform: "web", osVersion: "", deviceId: "x" },
      {
        onDeviceModelAvailable: false,
        platform: "other",
        osMajorVersion: null,
        deviceClass: "other",
      },
    ],
  ]

  table.forEach(([name, device, expected]) =>
    it(name, () => {
      expect(coverageOf(device)).toMatchObject(expected)
    }),
  )

  it("never reports the model's full identifier, only its generation", () => {
    table.forEach(([, device]) => {
      expect(coverageOf(device).deviceClass).not.toContain(",")
      expect(Object.keys(coverageOf(device)).sort()).toEqual(
        ["deviceClass", "onDeviceModelAvailable", "osMajorVersion", "platform"].sort(),
      )
    })
  })
})

describe("reportOnDeviceModelCoverage", () => {
  it("reports once per install, across two launches", async () => {
    const storage = memoryStorage()
    const log = jest.fn()
    const device = () => ios("iPhone16,1")

    await expect(reportOnDeviceModelCoverage({ storage, device, log })).resolves.toBe(
      true,
    )
    await expect(reportOnDeviceModelCoverage({ storage, device, log })).resolves.toBe(
      false,
    )

    expect(log.mock.calls).toEqual([
      [
        {
          onDeviceModelAvailable: true,
          platform: "ios",
          osMajorVersion: 26,
          deviceClass: "iPhone16",
        },
      ],
    ])
    expect(storage.data.get(COVERAGE_REPORTED_KEY)).toBe("1")
  })

  it("marks the install before it logs, so it never reports twice", async () => {
    const storage = memoryStorage()
    const order: string[] = []
    storage.setItem.mockImplementation(async (key: string, value: string) => {
      order.push("mark")
      storage.data.set(key, value)
    })

    await reportOnDeviceModelCoverage({
      storage,
      device: () => ios("iPhone16,1"),
      log: () => order.push("log"),
    })

    expect(order).toEqual(["mark", "log"])
  })

  it("reports nothing, and never throws, when storage fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const log = jest.fn()
    const storage = memoryStorage()
    storage.getItem.mockRejectedValue(new Error("no storage"))

    await expect(
      reportOnDeviceModelCoverage({ storage, device: () => ios("iPhone16,1"), log }),
    ).resolves.toBe(false)

    expect(log).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("reads the device it runs on by default", async () => {
    const log = jest.fn()

    await reportOnDeviceModelCoverage({ storage: memoryStorage(), log })

    expect(log).toHaveBeenCalledWith(
      coverageOf({ platform: Platform.OS, osVersion: "26.0.1", deviceId: "iPhone17,1" }),
    )
  })

  it("runs at every launch of the app, whatever the assistant's flag", () => {
    const app = fs.readFileSync(path.join(__dirname, "../../app/app.tsx"), "utf8")
    expect(app).toMatch(
      /useEffect\(\(\) => \{\s*reportOnDeviceModelCoverage\(\)\s*\}, \[\]\)/,
    )
    expect(app).not.toMatch(/assistantEnabled/)
  })
})

describe("logAssistantCoverage", () => {
  it("logs device capability only, and leaves out a version it could not read", () => {
    const { logEvent } = getAnalytics() as unknown as { logEvent: jest.Mock }
    logEvent.mockClear()

    logAssistantCoverage({
      onDeviceModelAvailable: true,
      platform: "ios",
      osMajorVersion: 26,
      deviceClass: "iPhone16",
    })
    logAssistantCoverage({
      onDeviceModelAvailable: false,
      platform: "android",
      osMajorVersion: null,
      deviceClass: "android",
    })

    expect(logEvent.mock.calls).toEqual([
      [
        "assistant_coverage",
        {
          on_device_model_available: true,
          platform: "ios",
          os_major_version: 26,
          device_class: "iPhone16",
        },
      ],
      [
        "assistant_coverage",
        {
          on_device_model_available: false,
          platform: "android",
          device_class: "android",
        },
      ],
    ])
  })
})
