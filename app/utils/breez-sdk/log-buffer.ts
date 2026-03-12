import { AppState } from "react-native"
import RNFS from "react-native-fs"

const MAX_ENTRIES = 100_000
const FLUSH_INTERVAL_MS = 5_000
const LOG_FILE = `${RNFS.DocumentDirectoryPath}/flash-spark-debug-logs.csv`
const CSV_HEADER = "timestamp,level,line"

// In-memory pending queue — drained on each flush
let pendingEntries: string[] = []
let fileLineCount = 0
let flushing = false
let initialized = false

const escapeCsvField = (value: string): string => {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Initialize the log buffer. Call once before SDK connect.
 * Creates the log file if it doesn't exist, counts existing lines,
 * and starts the periodic flush timer.
 */
export const initLogBuffer = async (): Promise<void> => {
  if (initialized) return
  initialized = true

  const exists = await RNFS.exists(LOG_FILE)
  if (!exists) {
    await RNFS.writeFile(LOG_FILE, CSV_HEADER + "\n", "utf8")
    fileLineCount = 0
  } else {
    const content = await RNFS.readFile(LOG_FILE, "utf8")
    const lines = content.split("\n").filter((l) => l.length > 0)
    fileLineCount = Math.max(0, lines.length - 1) // subtract header
  }

  setInterval(flushToDisk, FLUSH_INTERVAL_MS)

  AppState.addEventListener("change", (state) => {
    if (state === "background" || state === "inactive") {
      flushToDisk()
    }
  })
}

/**
 * Synchronous — safe to call from the logger callback.
 * Entries are queued in memory and flushed to disk periodically.
 */
export const appendLog = (level: string, line: string): void => {
  const timestamp = new Date().toISOString()
  const csvLine = `${escapeCsvField(timestamp)},${escapeCsvField(level)},${escapeCsvField(line)}`
  pendingEntries.push(csvLine)
}

/**
 * Flush pending entries to the log file on disk.
 * Guarded against concurrent execution.
 */
const flushToDisk = async (): Promise<void> => {
  if (flushing || pendingEntries.length === 0) return
  flushing = true

  const entries = pendingEntries
  pendingEntries = []

  try {
    await RNFS.appendFile(LOG_FILE, entries.join("\n") + "\n", "utf8")
    fileLineCount += entries.length

    if (fileLineCount > MAX_ENTRIES) {
      await trimFile()
    }
  } catch (err) {
    console.error("[log-buffer] flush error:", err)
  } finally {
    flushing = false
  }
}

const trimFile = async (): Promise<void> => {
  try {
    const content = await RNFS.readFile(LOG_FILE, "utf8")
    const lines = content.split("\n").filter((l) => l.length > 0)
    const header = lines[0]
    const dataLines = lines.slice(1)
    const trimmed = dataLines.slice(dataLines.length - MAX_ENTRIES)

    await RNFS.writeFile(LOG_FILE, header + "\n" + trimmed.join("\n") + "\n", "utf8")
    fileLineCount = trimmed.length
  } catch (err) {
    console.error("[log-buffer] trim error:", err)
  }
}

export const getLogFilePath = (): string => LOG_FILE
