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

beforeEach(() => {
  jest.useFakeTimers()
  jest.resetModules()
  rnfs = jest.requireMock("react-native-fs") as Rnfs
  rnfs.appendFile.mockResolvedValue(undefined)
  rnfs.writeFile.mockResolvedValue(undefined)
  rnfs.moveFile.mockResolvedValue(undefined)
  rnfs.unlink.mockResolvedValue(undefined)
  existing({})
  buffer = jest.requireActual("@app/utils/breez-sdk/log-buffer") as Buffer
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
    buffer.appendLog("INFO", "a longer line that takes the file over the cap") // 78 bytes
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
})

describe("getLogFilePaths", () => {
  it("names the current file alone before any rotation", async () => {
    await expect(buffer.getLogFilePaths()).resolves.toEqual([LOG])
  })

  it("names both generations after a rotation", async () => {
    existing({ [LOG]: 10, [PREVIOUS]: 10 })
    await expect(buffer.getLogFilePaths()).resolves.toEqual([LOG, PREVIOUS])
  })
})
