// The Breez SDK log buffer manages its CSV by size and never reads it back
// (ENG-728). Reading the whole file to trim it at a line cap pegged the JS
// thread once a phone reached the cap: every 5 s flush re-read and rewrote
// 18 MB through react-native-fs's JS base64 decode.
import type RNFSType from "react-native-fs"

jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn() },
}))

type Buffer = typeof import("@app/utils/breez-sdk/log-buffer")
type Rnfs = jest.Mocked<typeof RNFSType>

const LOG = "/tmp/flash-spark-debug-logs.csv"
const PREVIOUS = "/tmp/flash-spark-debug-logs.1.csv"
const OVER_THE_CAP = 8 * 1024 * 1024 + 1

// The module keeps its state at module level, so every test loads a fresh
// one, together with the react-native-fs mock instance that fresh module sees.
let rnfs: Rnfs
let buffer: Buffer

const existing = (files: Record<string, number>) => {
  rnfs.exists.mockImplementation((path: string) => Promise.resolve(path in files))
  rnfs.stat.mockImplementation(((path: string) =>
    Promise.resolve({ size: files[path] ?? 0 })) as unknown as typeof RNFSType.stat)
}

// The AppState listener initLogBuffer registered, from the react-native mock
// instance the fresh buffer imported.
const appStateListener = (): ((state: string) => void) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppState } = require("react-native") as {
    AppState: { addEventListener: jest.Mock<void, [string, (state: string) => void]> }
  }
  const [event, listener] = AppState.addEventListener.mock.calls[0]
  expect(event).toBe("change")
  return listener
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.resetModules()
  // A plain require after resetModules: jest.requireMock serves a different
  // instance than the one the buffer imports.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  rnfs = require("react-native-fs") as Rnfs
  rnfs.appendFile.mockResolvedValue(undefined)
  rnfs.writeFile.mockResolvedValue(undefined)
  rnfs.moveFile.mockResolvedValue(undefined)
  rnfs.unlink.mockResolvedValue(undefined)
  existing({})
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  buffer = require("@app/utils/breez-sdk/log-buffer") as Buffer
})

afterEach(() => {
  jest.useRealTimers()
})

describe("initLogBuffer", () => {
  it("takes an existing file's size from the file system and never reads it", async () => {
    existing({ [LOG]: 18_847_761 })
    await buffer.initLogBuffer()
    expect(rnfs.stat).toHaveBeenCalledWith(LOG)
    expect(rnfs.readFile).not.toHaveBeenCalled()
    expect(rnfs.writeFile).not.toHaveBeenCalled()
  })

  it("starts a missing file with the CSV header", async () => {
    await buffer.initLogBuffer()
    expect(rnfs.writeFile).toHaveBeenCalledWith(LOG, "timestamp,level,line\n", "utf8")
    expect(rnfs.readFile).not.toHaveBeenCalled()
  })

  it("initializes once", async () => {
    await buffer.initLogBuffer()
    await buffer.initLogBuffer()
    expect(rnfs.exists).toHaveBeenCalledTimes(1)
  })
})

describe("appendLog and flushLogBuffer", () => {
  it("queues lines and appends them in one chunk, CSV-escaped, ending in a newline", async () => {
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "plain line")
    buffer.appendLog("WARN", 'has, a comma and "quotes"')
    expect(rnfs.appendFile).not.toHaveBeenCalled()
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(1)
    const [path, chunk, encoding] = rnfs.appendFile.mock.calls[0]
    expect(path).toBe(LOG)
    expect(encoding).toBe("utf8")
    const lines = (chunk as string).split("\n")
    expect(lines).toHaveLength(3) // two entries and the trailing newline
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z,INFO,plain line$/)
    expect(lines[1]).toMatch(/,WARN,"has, a comma and ""quotes"""$/)
    expect(lines[2]).toBe("")
    expect(rnfs.readFile).not.toHaveBeenCalled()
  })

  it("does nothing with an empty queue", async () => {
    await buffer.initLogBuffer()
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).not.toHaveBeenCalled()
  })

  it("flushes on the interval", async () => {
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "on a timer")
    jest.advanceTimersByTime(5_000)
    await Promise.resolve()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(1)
  })

  it("swallows a failed flush and flushes again next time", async () => {
    await buffer.initLogBuffer()
    rnfs.appendFile.mockRejectedValueOnce(new Error("disk full"))
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    buffer.appendLog("INFO", "first")
    await expect(buffer.flushLogBuffer()).resolves.toBeUndefined()
    buffer.appendLog("INFO", "second")
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
})

describe("rotation", () => {
  it("moves a file past MAX_BYTES aside and starts a fresh one, without reading it", async () => {
    existing({ [LOG]: 18_847_761 })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "one more line")
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(1)
    expect(rnfs.moveFile).toHaveBeenCalledWith(LOG, PREVIOUS)
    expect(rnfs.writeFile).toHaveBeenCalledWith(LOG, "timestamp,level,line\n", "utf8")
    expect(rnfs.unlink).not.toHaveBeenCalled() // no previous generation yet
    expect(rnfs.readFile).not.toHaveBeenCalled()
    // the order: append, then move, then the fresh header
    const order = [
      rnfs.appendFile.mock.invocationCallOrder[0],
      rnfs.moveFile.mock.invocationCallOrder[0],
      rnfs.writeFile.mock.invocationCallOrder[0],
    ]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("replaces the previous generation when there is one", async () => {
    existing({ [LOG]: OVER_THE_CAP, [PREVIOUS]: 10 })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "one more line")
    await buffer.flushLogBuffer()
    expect(rnfs.unlink).toHaveBeenCalledWith(PREVIOUS)
    expect(rnfs.unlink.mock.invocationCallOrder[0]).toBeLessThan(
      rnfs.moveFile.mock.invocationCallOrder[0],
    )
    expect(rnfs.moveFile).toHaveBeenCalledWith(LOG, PREVIOUS)
  })

  it("rotates only once the appended bytes take the file past the cap", async () => {
    existing({ [LOG]: buffer.MAX_BYTES - 60 })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "x") // 32 bytes with its timestamp: still under the cap
    await buffer.flushLogBuffer()
    expect(rnfs.moveFile).not.toHaveBeenCalled()
    buffer.appendLog("INFO", "a longer line that takes the file over the cap") // 77 bytes
    await buffer.flushLogBuffer()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(1)
  })

  it("counts UTF-8 bytes, not characters", () => {
    const { utf8ByteLength } = buffer
    expect(utf8ByteLength("abc")).toBe(3)
    expect(utf8ByteLength("é")).toBe(2)
    expect(utf8ByteLength("€")).toBe(3)
    expect(utf8ByteLength("💸")).toBe(4)
  })

  it("counts a flush in UTF-8 bytes toward the cap, not in characters", async () => {
    existing({ [LOG]: buffer.MAX_BYTES - 100 })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "€".repeat(30)) // 61 characters with its timestamp, 121 bytes
    await buffer.flushLogBuffer()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(1)
  })

  it("rotates once, then keeps appending to the fresh file", async () => {
    existing({ [LOG]: OVER_THE_CAP })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "rotates")
    await buffer.flushLogBuffer()
    // On disk now: the full file as the previous generation, and a fresh file
    // holding the 21-byte header.
    existing({ [LOG]: 21, [PREVIOUS]: OVER_THE_CAP })
    buffer.appendLog("INFO", "lands in the fresh file")
    await buffer.flushLogBuffer()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(1)
    expect(rnfs.unlink).not.toHaveBeenCalled() // the generation just preserved stays
    expect(rnfs.appendFile).toHaveBeenCalledTimes(2)
    expect(rnfs.appendFile.mock.calls[1][0]).toBe(LOG)
  })

  it("counts the fresh file from its 21-byte header", async () => {
    existing({ [LOG]: OVER_THE_CAP })
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "rotates")
    await buffer.flushLogBuffer()
    // The timestamp, level, separators and newline add 31 bytes to a line, so
    // with the header this line takes the fresh file one byte past the cap.
    buffer.appendLog("INFO", "x".repeat(buffer.MAX_BYTES - 21 - 31 + 1))
    await buffer.flushLogBuffer()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(2)
  })
})

describe("a failed rotation", () => {
  let consoleError: jest.SpyInstance
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    consoleError.mockRestore()
  })

  it("leaves the generation just preserved alone when the fresh header fails to write", async () => {
    existing({ [LOG]: OVER_THE_CAP })
    await buffer.initLogBuffer()
    rnfs.writeFile.mockRejectedValueOnce(new Error("disk full"))
    buffer.appendLog("INFO", "rotates, then the header write fails")
    await expect(buffer.flushLogBuffer()).resolves.toBeUndefined()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      "[log-buffer] flush error:",
      expect.any(Error),
    )
    // On disk now: the full file as the previous generation, and no current
    // file until the next append creates one.
    existing({ [PREVIOUS]: OVER_THE_CAP })
    buffer.appendLog("INFO", "lands in a new current file")
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(2)
    expect(rnfs.unlink).not.toHaveBeenCalled()
    expect(rnfs.moveFile).toHaveBeenCalledTimes(1)
  })

  it("writes no header over the full file when the move fails, and retries the move next flush", async () => {
    existing({ [LOG]: OVER_THE_CAP, [PREVIOUS]: 10 })
    await buffer.initLogBuffer()
    rnfs.moveFile.mockRejectedValueOnce(new Error("busy"))
    buffer.appendLog("INFO", "the move fails")
    await expect(buffer.flushLogBuffer()).resolves.toBeUndefined()
    expect(rnfs.writeFile).not.toHaveBeenCalled()
    // On disk now: the full current file alone; the old previous generation was
    // unlinked before the move.
    existing({ [LOG]: OVER_THE_CAP })
    buffer.appendLog("INFO", "the move is retried")
    await buffer.flushLogBuffer()
    expect(rnfs.unlink).toHaveBeenCalledTimes(1)
    expect(rnfs.moveFile).toHaveBeenCalledTimes(2)
    expect(rnfs.moveFile).toHaveBeenLastCalledWith(LOG, PREVIOUS)
    expect(rnfs.writeFile).toHaveBeenCalledTimes(1)
    expect(rnfs.writeFile).toHaveBeenCalledWith(LOG, "timestamp,level,line\n", "utf8")
  })
})

describe("the flush lock", () => {
  // Holds the next append open, as a slow disk would; returns its release.
  const holdNextAppend = (): (() => void) => {
    let release: () => void = () => undefined
    rnfs.appendFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve()
        }),
    )
    return () => release()
  }

  it("skips a flush while another is in flight", async () => {
    await buffer.initLogBuffer()
    const release = holdNextAppend()
    buffer.appendLog("INFO", "first")
    const inFlight = buffer.flushLogBuffer()
    buffer.appendLog("INFO", "queued while the first flush is in flight")
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(1)
    release()
    await inFlight
  })

  it("is released when the flush ends, and the next flush writes what was queued meanwhile", async () => {
    await buffer.initLogBuffer()
    const release = holdNextAppend()
    buffer.appendLog("INFO", "first")
    const inFlight = buffer.flushLogBuffer()
    buffer.appendLog("INFO", "queued while the first flush is in flight")
    release()
    await inFlight
    await buffer.flushLogBuffer()
    expect(rnfs.appendFile).toHaveBeenCalledTimes(2)
    expect(rnfs.appendFile.mock.calls[0][1]).toMatch(/,INFO,first\n$/)
    expect(rnfs.appendFile.mock.calls[1][1]).toMatch(
      /,INFO,queued while the first flush is in flight\n$/,
    )
  })
})

describe("the AppState flush", () => {
  const leavingTheForeground = ["background", "inactive"]
  leavingTheForeground.forEach((state) => {
    it(`flushes when the app turns ${state}`, async () => {
      await buffer.initLogBuffer()
      buffer.appendLog("INFO", "flushed on the way out")
      appStateListener()(state)
      await Promise.resolve()
      expect(rnfs.appendFile).toHaveBeenCalledTimes(1)
    })
  })

  it("leaves the queue to the interval when the app turns active", async () => {
    await buffer.initLogBuffer()
    buffer.appendLog("INFO", "waits for the interval")
    appStateListener()("active")
    await Promise.resolve()
    expect(rnfs.appendFile).not.toHaveBeenCalled()
  })
})

describe("getLogFilePaths", () => {
  it("names the current file alone before any rotation", async () => {
    existing({ [LOG]: 10 })
    await expect(buffer.getLogFilePaths()).resolves.toEqual([LOG])
  })

  it("names both generations after a rotation", async () => {
    existing({ [LOG]: 10, [PREVIOUS]: 10 })
    await expect(buffer.getLogFilePaths()).resolves.toEqual([LOG, PREVIOUS])
  })

  it("names the previous generation alone while there is no current file", async () => {
    // as a header write that failed after the move leaves it
    existing({ [PREVIOUS]: OVER_THE_CAP })
    await expect(buffer.getLogFilePaths()).resolves.toEqual([PREVIOUS])
  })

  it("names nothing when there is no log file", async () => {
    await expect(buffer.getLogFilePaths()).resolves.toEqual([])
  })
})
