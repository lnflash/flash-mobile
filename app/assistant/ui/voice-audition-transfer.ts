import { Buffer } from "buffer"
import type { DownloadFileOptions, DownloadResult } from "react-native-fs"
import type { AuditionFile } from "./voice-audition-download"
/** Small audition WAVs only. The full model must use a native streaming downloader. */
export const createAuditionTransfer = ({
  files,
  write,
  request = fetch,
}: {
  files: readonly AuditionFile[]
  write: (path: string, base64: string) => Promise<void>
  request?: typeof fetch
}) => {
  let nextJob = 0
  const jobs = new Map<number, { controller: AbortController; cancel: () => void }>()
  return {
    downloadFile: (options: DownloadFileOptions) => {
      nextJob += 1
      const jobId = nextJob
      const controller = new AbortController()
      let cancel = () => undefined as void
      const aborted = new Promise<never>((_, reject) => {
        cancel = () => reject(new Error("Canceled"))
      })
      jobs.set(jobId, { controller, cancel })
      const work = async (): Promise<DownloadResult> => {
        const file = files.find((entry) => options.fromUrl.endsWith(`/${entry.name}`))
        if (!__DEV__ || !file || file.bytes > 5_000_000) throw new Error("Invalid sample")
        const response = await request(options.fromUrl, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) !== file.bytes ||
          controller.signal.aborted
        )
          throw new Error("Incomplete sample")
        const data = await response.arrayBuffer()
        if (data.byteLength !== file.bytes || controller.signal.aborted)
          throw new Error("Incomplete sample")
        await write(options.toFile, Buffer.from(data).toString("base64"))
        if (controller.signal.aborted) throw new Error("Canceled")
        return { jobId, statusCode: response.status, bytesWritten: data.byteLength }
      }
      const timer = setTimeout(() => {
        controller.abort()
        cancel()
      }, 30000)
      const promise = Promise.race([work(), aborted]).finally(() => {
        clearTimeout(timer)
        jobs.delete(jobId)
      })
      return { jobId, promise }
    },
    stopDownload: (id: number) => {
      const job = jobs.get(id)
      job?.controller.abort()
      job?.cancel()
    },
  }
}
