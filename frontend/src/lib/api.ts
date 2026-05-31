import type { StreamEvent } from '@/types'
import { z } from 'zod'


const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// ─── SSE Parser ──────────────────────────────────────────────────────────────

export async function* parseSSE(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const eventLine = block.match(/^event: (.+)$/m)?.[1]
      const dataLine  = block.match(/^data: (.+)$/ms)?.[1]
      if (!dataLine) continue

      try {
        const parsed = JSON.parse(dataLine)
        // If there's an event line, use discriminated union
        if (eventLine) {
          const result = z.object({
            event: z.string(),
            data: z.unknown(),
          }).safeParse({ event: eventLine, data: parsed })
          if (result.success) {
            yield result.data as StreamEvent
          }
        }
      } catch {
        // malformed JSON — skip
      }
    }
  }
}

// ─── Chat API ─────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  threadId = 'default'
): Promise<Response> {
  return fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread_id: threadId }),
  })
}

// ─── Health API ───────────────────────────────────────────────────────────────

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/health`)
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

// ─── Metrics API ──────────────────────────────────────────────────────────────

export async function fetchMetrics() {
  const res = await fetch(`${BASE_URL}/metrics`)
  if (!res.ok) throw new Error('Metrics fetch failed')
  return res.json()
}

// ─── Cache Stats API ──────────────────────────────────────────────────────────

export async function fetchCacheStats() {
  const res = await fetch(`${BASE_URL}/cache/stats`)
  if (!res.ok) throw new Error('Cache stats fetch failed')
  return res.json()
}
