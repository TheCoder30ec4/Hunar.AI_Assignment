import { apiErrorFromThrown } from './errors'

/**
 * POST a JSON body and yield each SSE `data:` payload as parsed JSON.
 * fetch + a manual reader rather than EventSource — EventSource only issues
 * GET requests, and every stream in this app carries a POST body. Frames
 * are separated by a blank line and can arrive split across chunks, so
 * this buffers until a complete frame is seen.
 */
export async function* readSseStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<unknown, void, void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })

  if (!response.ok || !response.body) {
    throw apiErrorFromThrown(new Error(`Stream request failed with status ${String(response.status)}`))
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value

    let frameBreak: number
    while ((frameBreak = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, frameBreak)
      buffer = buffer.slice(frameBreak + 2)
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
      if (dataLine) yield JSON.parse(dataLine.slice('data: '.length)) as unknown
    }
  }
}
