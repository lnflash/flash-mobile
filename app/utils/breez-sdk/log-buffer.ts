import { AppState } from "react-native"
import RNFS from "react-native-fs"

// The Breez SDK's log lines, kept on disk for the "Export Spark logs"
// setting. spark.ts wires the SDK logger to appendLog in production bundles.
//
// The file is managed by size and never read here (ENG-728). Reading it back
// to trim it, as this file once did at a 100,000-line cap, meant that once a
// phone reached the cap every flush re-read the whole file through
// react-native-fs's JS base64 decode and rewrote it, which pegged the JS
// thread for as long as the SDK logged: during a sync, continuously. Now a
// file past MAX_BYTES is moved aside as the previous generation (a native
// rename) and a fresh one is started. The export shares both generations.
export const MAX_BYTES = 8 * 1024 * 1024
const FLUSH_INTERVAL_MS = 5_000
const LOG_FILE = `${RNFS.DocumentDirectoryPath}/flash-spark-debug-logs.csv`
const PREVIOUS_LOG_FILE = `${RNFS.DocumentDirectoryPath}/flash-spark-debug-logs.1.csv`
const CSV_HEADER = "timestamp,level,line"

// In-memory pending queue — drained on each flush
let pendingEntries: string[] = []
let fileBytes = 0
let flushing = false
let initialized = false

const escapeCsvField = (value: string): string => {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** UTF-8 length of a string, as RNFS.appendFile writes it. */
export const utf8ByteLength = (text: string): number => {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      // a surrogate pair is one 4-byte code point
      bytes += 4
      i += 1
    } else bytes += 3
  }
  return bytes
}

const startFreshFile = async (): Promise<void> => {
  const header = CSV_HEADER + "\n"
  await RNFS.writeFile(LOG_FILE, header, "utf8")
  fileBytes = utf8ByteLength(header)
}

/**
 * Initialize the log buffer. Call once before SDK connect.
 * Creates the log file if it doesn't exist, takes its size from the file
 * system (the content is never read), and starts the periodic flush timer.
 */
export const initLogBuffer = async (): Promise<void> => {
  if (initialized) return
  initialized = true
  const exists = await RNFS.exists(LOG_FILE)
  if (exists) {
    const { size } = await RNFS.stat(LOG_FILE)
    // initLogBuffer runs once (the initialized guard above), so nothing else
    // writes fileBytes across this await.
    // eslint-disable-next-line require-atomic-updates
    fileBytes = Number(size) || 0
  } else {
    await startFreshFile()
  }
  setInterval(flushLogBuffer, FLUSH_INTERVAL_MS)
  AppState.addEventListener("change", (state) => {
    if (state === "background" || state === "inactive") {
      flushLogBuffer()
    }
  })
}

/**
 * Synchronous — safe to call from the logger callback.
 * Entries are queued in memory and flushed to disk periodically.
 */
export const appendLog = (level: string, line: string): void => {
  const timestamp = new Date().toISOString()
  const csvLine = `${escapeCsvField(timestamp)},${escapeCsvField(level)},${escapeCsvField(
    line,
  )}`
  pendingEntries.push(csvLine)
}

/** Move the full file aside as the previous generation and start a new one. */
const rotateFile = async (): Promise<void> => {
  if (await RNFS.exists(PREVIOUS_LOG_FILE)) {
    await RNFS.unlink(PREVIOUS_LOG_FILE)
  }
  await RNFS.moveFile(LOG_FILE, PREVIOUS_LOG_FILE)
  await startFreshFile()
}

/**
 * Flush pending entries to the log file on disk, rotating it once it is past
 * MAX_BYTES. Guarded against concurrent execution. Exported for the
 * AppState listener and for tests; the interval calls it too.
 */
export const flushLogBuffer = async (): Promise<void> => {
  if (flushing || pendingEntries.length === 0) return
  flushing = true
  const entries = pendingEntries
  pendingEntries = []
  try {
    const chunk = entries.join("\n") + "\n"
    await RNFS.appendFile(LOG_FILE, chunk, "utf8")
    // `flushing` serializes flushes, so this is the only writer of fileBytes
    // between the append and here; startFreshFile resets it under the same lock.
    // eslint-disable-next-line require-atomic-updates
    fileBytes += utf8ByteLength(chunk)
    if (fileBytes > MAX_BYTES) {
      await rotateFile()
    }
  } catch (err) {
    console.error("[log-buffer] flush error:", err)
  } finally {
    // `flushing` is the lock itself; releasing it after the awaits is the point.
    // eslint-disable-next-line require-atomic-updates
    flushing = false
  }
}

export const getLogFilePath = (): string => LOG_FILE
export const getPreviousLogFilePath = (): string => PREVIOUS_LOG_FILE

/** The current file, and the previous generation when one exists. */
export const getLogFilePaths = async (): Promise<string[]> => {
  const paths = [LOG_FILE]
  if (await RNFS.exists(PREVIOUS_LOG_FILE)) paths.push(PREVIOUS_LOG_FILE)
  return paths
}
