import type { DownloadFileOptions, DownloadResult } from "react-native-fs"
export type AuditionFile = { name: string; bytes: number; sha256: string }
export type AuditionDownloadState = {
  phase:
    | "idle"
    | "checking"
    | "downloading"
    | "canceling"
    | "ready"
    | "removing"
    | "error"
  progress: number
}
export type AuditionFS = {
  exists: (path: string) => Promise<boolean>
  mkdir: (
    path: string,
    options?: { NSURLIsExcludedFromBackupKey?: boolean },
  ) => Promise<void>
  unlink: (path: string) => Promise<void>
  moveFile: (from: string, to: string) => Promise<void>
  stat: (path: string) => Promise<{ size: number | string }>
  hash: (path: string, algorithm: string) => Promise<string>
  downloadFile: (options: DownloadFileOptions) => {
    jobId: number
    promise: Promise<DownloadResult>
  }
  stopDownload: (job: number) => void
}
/** Optional, Debug-only generic sample pack. Never downloads on mount or during an answer. */
export const createAuditionDownload = ({
  fs,
  root,
  files,
  baseUrl,
}: {
  fs: AuditionFS
  root: string
  files: readonly AuditionFile[]
  baseUrl: () => string
}) => {
  let state: AuditionDownloadState = { phase: "idle", progress: 0 }
  const listeners = new Set<() => void>()
  const operation = { busy: false, canceled: false }
  const unlock = () => {
    operation.busy = false
  }
  let nextInstall = 0
  let jobId: number | undefined
  const publish = (phase: AuditionDownloadState["phase"], progress = 0) => {
    state = { phase, progress }
    listeners.forEach((listener) => listener())
  }
  const remove = async (path: string) => {
    if (await fs.exists(path)) await fs.unlink(path)
  }
  const valid = async (directory: string) => {
    if (!files.length) return false
    for (const file of files) {
      const path = `${directory}/${file.name}`
      if (
        !(await fs.exists(path)) ||
        Number((await fs.stat(path)).size) !== file.bytes ||
        (await fs.hash(path, "sha256")) !== file.sha256
      )
        return false
    }
    return true
  }
  return {
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    path: (name: string) => {
      if (state.phase !== "ready" || !files.some((file) => file.name === name))
        throw new Error("Sample unavailable")
      return `${root}/v1/${name}`
    },
    check: async () => {
      if (operation.busy) return
      operation.busy = true
      publish("checking")
      try {
        await remove(`${root}/staging`)
        publish((await valid(`${root}/v1`)) ? "ready" : "idle")
      } catch {
        publish("error")
      } finally {
        unlock()
      }
    },
    download: async () => {
      if (operation.busy || state.phase === "ready") return
      operation.busy = true
      operation.canceled = false
      publish("downloading")
      nextInstall += 1
      const staging = `${root}/staging/${Date.now()}-${nextInstall}`
      try {
        if (!__DEV__ || !files.length) throw new Error("Audition unavailable")
        const origin = baseUrl()
        if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error("Invalid sample source")
        await remove(staging)
        await fs.mkdir(staging, { NSURLIsExcludedFromBackupKey: true })
        const total = files.reduce((sum, file) => sum + file.bytes, 0)
        let done = 0
        for (const file of files) {
          if (operation.canceled) throw new Error("Canceled")
          if (
            !/^[a-z_]+-(welcome|guidance|amounts)\.wav$/.test(file.name) ||
            file.bytes <= 0 ||
            file.bytes > 5_000_000 ||
            !/^[a-f0-9]{64}$/.test(file.sha256)
          )
            throw new Error("Invalid sample manifest")
          const transfer = { active: true, completed: done }
          try {
            const task = fs.downloadFile({
              fromUrl: `${origin}/${file.name}`,
              toFile: `${staging}/${file.name}`,
              background: false,
              progressInterval: 100,
              connectionTimeout: 10000,
              readTimeout: 30000,
              progress: (event) => {
                if (transfer.active && !operation.canceled)
                  publish(
                    "downloading",
                    Math.min(1, (transfer.completed + event.bytesWritten) / total),
                  )
              },
            })
            jobId = task.jobId
            const result = await task.promise
            jobId = undefined
            if (operation.canceled) throw new Error("Canceled")
            if (result.statusCode !== 200 || result.bytesWritten !== file.bytes)
              throw new Error("Incomplete sample")
            done += file.bytes
            publish("downloading", done / total)
          } finally {
            transfer.active = false
          }
        }
        if (!(await valid(staging)) || operation.canceled)
          throw new Error("Invalid sample pack")
        await remove(`${root}/v1`)
        if (operation.canceled) throw new Error("Canceled")
        await fs.moveFile(staging, `${root}/v1`)
        if (operation.canceled) {
          await remove(`${root}/v1`)
          throw new Error("Canceled")
        }
        publish("ready", 1)
      } catch {
        try {
          await remove(staging)
        } catch {
          /* Retry clears staging before downloading. */
        }
        publish(operation.canceled ? "idle" : "error")
      } finally {
        jobId = undefined
        unlock()
      }
    },
    cancel: () => {
      if (!operation.busy || state.phase === "checking" || state.phase === "removing")
        return
      operation.canceled = true
      publish("canceling", state.progress)
      if (jobId !== undefined) fs.stopDownload(jobId)
    },
    remove: async () => {
      if (operation.busy) return
      operation.busy = true
      publish("removing")
      try {
        await remove(root)
        publish("idle")
      } catch {
        publish("error")
      } finally {
        unlock()
      }
    },
  }
}
