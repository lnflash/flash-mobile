import {
  createAuditionDownload,
  AuditionFile,
  AuditionFS,
} from "@app/assistant/ui/voice-audition-download"
const files: AuditionFile[] = [
  { name: "af_heart-welcome.wav", bytes: 100, sha256: "a".repeat(64) },
  { name: "bf_emma-guidance.wav", bytes: 200, sha256: "b".repeat(64) },
]
const setup = () => {
  const disk = new Map<string, { size: number; hash: string }>()
  const dirs = new Set<string>()
  const fs: AuditionFS = {
    exists: jest.fn(async (path) => disk.has(path) || dirs.has(path)),
    mkdir: jest.fn(async (path) => {
      dirs.add(path)
    }),
    unlink: jest.fn(async (path) => {
      for (const key of disk.keys())
        if (key === path || key.startsWith(`${path}/`)) disk.delete(key)
      dirs.delete(path)
    }),
    stat: jest.fn(async (path) => ({ size: disk.get(path)?.size ?? 0 })),
    hash: jest.fn(async (path) => disk.get(path)?.hash ?? ""),
    moveFile: jest.fn(async (from, to) => {
      for (const [key, value] of [...disk])
        if (key.startsWith(`${from}/`)) {
          disk.set(key.replace(from, to), value)
          disk.delete(key)
        }
      dirs.delete(from)
      dirs.add(to)
    }),
    downloadFile: jest.fn((options) => {
      const file = files.find((entry) => options.fromUrl.endsWith(entry.name))
      if (!file) throw new Error("Unexpected sample")
      disk.set(options.toFile, { size: file.bytes, hash: file.sha256 })
      return {
        jobId: 1,
        promise: Promise.resolve({ jobId: 1, statusCode: 200, bytesWritten: file.bytes }),
      }
    }),
    stopDownload: jest.fn(),
  }
  const store = createAuditionDownload({
    fs,
    root: "/samples",
    files,
    baseUrl: () => "http://localhost:18083",
  })
  return { fs, disk, dirs, store }
}
it("checks local files without network and publishes only a fully verified optional download", async () => {
  const { fs, store } = setup()
  await store.check()
  expect(store.get().phase).toBe("idle")
  expect(fs.downloadFile).not.toHaveBeenCalled()
  await store.download()
  expect(store.get().phase).toBe("ready")
  expect(store.path(files[0].name)).toBe(`/samples/v1/${files[0].name}`)
  expect(fs.hash).toHaveBeenCalledTimes(2)
  await store.check()
  expect(store.get().phase).toBe("ready")
  expect(fs.downloadFile).toHaveBeenCalledTimes(2)
  await store.remove()
  expect(store.get().phase).toBe("idle")
  expect(() => store.path(files[0].name)).toThrow()
})
it("rejects corrupt or truncated downloads without publishing partial files", async () => {
  const { fs, disk, store } = setup()
  ;(fs.hash as jest.Mock).mockResolvedValue("corrupt")
  await store.download()
  expect(store.get().phase).toBe("error")
  expect(disk.size).toBe(0)
  expect(fs.moveFile).not.toHaveBeenCalled()
  ;(fs.hash as jest.Mock).mockImplementation(async (path: string) => disk.get(path)?.hash)
  await store.download()
  expect(store.get().phase).toBe("ready")
})
it("cancels pending transfers, ignores late progress and permits a clean retry", async () => {
  const { fs, store } = setup()
  const original = fs.downloadFile
  let reject: (error: Error) => void = () => undefined
  let progress:
    | ((event: { bytesWritten: number; contentLength: number; jobId: number }) => void)
    | undefined
  ;(fs.downloadFile as jest.Mock).mockImplementationOnce((options) => {
    progress = options.progress
    return {
      jobId: 7,
      promise: new Promise((_, fail) => {
        reject = fail
      }),
    }
  })
  const work = store.download()
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  store.cancel()
  expect(fs.stopDownload).toHaveBeenCalledWith(7)
  reject(new Error("Canceled"))
  await work
  expect(store.get().phase).toBe("idle")
  progress?.({ jobId: 7, contentLength: 100, bytesWritten: 100 })
  expect(store.get().phase).toBe("idle")
  expect(fs.downloadFile).toBe(original)
  await store.download()
  expect(store.get().phase).toBe("ready")
})
it("does not run concurrent installs and ignores post-completion progress", async () => {
  const { fs, store } = setup()
  let progress: Parameters<AuditionFS["downloadFile"]>[0]["progress"]
  const original = (fs.downloadFile as jest.Mock).getMockImplementation()
  if (!original) throw new Error("Missing download mock")
  ;(fs.downloadFile as jest.Mock).mockImplementation((options) => {
    progress = options.progress
    return original(options)
  })
  await Promise.all([store.download(), store.download()])
  expect(fs.downloadFile).toHaveBeenCalledTimes(2)
  progress?.({ jobId: 1, contentLength: 200, bytesWritten: 100 })
  expect(store.get().phase).toBe("ready")
})
it("does not use incomplete cached files after a restart", async () => {
  const { fs, disk, dirs, store } = setup()
  dirs.add("/samples/v1")
  disk.set(`/samples/v1/${files[0].name}`, { size: 2, hash: "a".repeat(64) })
  await store.check()
  expect(store.get().phase).toBe("idle")
  expect(fs.downloadFile).not.toHaveBeenCalled()
})
