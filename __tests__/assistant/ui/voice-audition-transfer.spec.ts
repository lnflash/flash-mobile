import { createAuditionTransfer } from "@app/assistant/ui/voice-audition-transfer"
const file = { name: "af_heart-welcome.wav", bytes: 4, sha256: "a".repeat(64) }
const response = () => ({
  ok: true,
  status: 200,
  headers: { get: () => "4" },
  arrayBuffer: jest.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
})
it("writes only a complete bounded sample and returns an acknowledged transfer", async () => {
  const write = jest.fn(async () => undefined)
  const request = jest.fn(async () => response())
  const transfer = createAuditionTransfer({
    files: [file],
    write,
    request: request as unknown as typeof fetch,
  })
  const task = transfer.downloadFile({
    fromUrl: `http://host/${file.name}`,
    toFile: "/sample.wav",
  })
  expect(await task.promise).toEqual({
    jobId: task.jobId,
    statusCode: 200,
    bytesWritten: 4,
  })
  expect(write).toHaveBeenCalledWith("/sample.wav", "AQIDBA==")
})
it("cancels even when a request never acknowledges abort and prevents late writes", async () => {
  const write = jest.fn(async () => undefined)
  let complete: (value: ReturnType<typeof response>) => void = () => undefined
  const request = jest.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const transfer = createAuditionTransfer({
    files: [file],
    write,
    request: request as unknown as typeof fetch,
  })
  const task = transfer.downloadFile({
    fromUrl: `http://host/${file.name}`,
    toFile: "/canceled.wav",
  })
  transfer.stopDownload(task.jobId)
  await expect(task.promise).rejects.toThrow("Canceled")
  complete(response())
  await Promise.resolve()
  await Promise.resolve()
  expect(write).not.toHaveBeenCalled()
  expect(request.mock.calls).toHaveLength(1)
})
it("rejects unexpected content length before allocating or writing audio", async () => {
  const reply = response()
  reply.headers.get = () => "999999999"
  const write = jest.fn(async () => undefined)
  const transfer = createAuditionTransfer({
    files: [file],
    write,
    request: jest.fn(async () => reply) as unknown as typeof fetch,
  })
  await expect(
    transfer.downloadFile({ fromUrl: `http://host/${file.name}`, toFile: "/bad.wav" })
      .promise,
  ).rejects.toThrow("Incomplete sample")
  expect(reply.arrayBuffer).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})
it("bounds a stalled transfer and releases its cancellation timer", async () => {
  jest.useFakeTimers()
  try {
    const transfer = createAuditionTransfer({
      files: [file],
      write: jest.fn(),
      request: jest.fn(
        () =>
          new Promise(() => {
            /* Stalled transport. */
          }),
      ) as unknown as typeof fetch,
    })
    const task = transfer.downloadFile({
      fromUrl: `http://host/${file.name}`,
      toFile: "/stalled.wav",
    })
    jest.advanceTimersByTime(30001)
    await expect(task.promise).rejects.toThrow("Canceled")
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    jest.useRealTimers()
  }
})
