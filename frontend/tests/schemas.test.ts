import { describe, it, expect } from 'vitest'
import {
  ChatRequestSchema,
  ChatResponseSchema,
  HealthResponseSchema,
  MetricsResponseSchema,
  StreamEventSchema,
} from '../src/types/index'
import { formatMs, formatNumber, relativeTime } from '../src/lib/utils'

// ─── ChatRequest ──────────────────────────────────────────────────────────────

describe('ChatRequestSchema', () => {
  it('accepts valid request', () => {
    expect(ChatRequestSchema.safeParse({ message: 'Hello', thread_id: 'abc' }).success).toBe(true)
  })
  it('applies default thread_id', () => {
    const r = ChatRequestSchema.safeParse({ message: 'Hello' })
    expect(r.success && r.data.thread_id).toBe('default')
  })
  it('rejects empty message', () => {
    expect(ChatRequestSchema.safeParse({ message: '' }).success).toBe(false)
  })
  it('rejects message over 10000 chars', () => {
    expect(ChatRequestSchema.safeParse({ message: 'a'.repeat(10001) }).success).toBe(false)
  })
})

// ─── ChatResponse ─────────────────────────────────────────────────────────────

describe('ChatResponseSchema', () => {
  const valid = {
    response: 'Paris is the capital.',
    thread_id: 'abc',
    model_used: 'primary',
    cached: false,
    processing_time_ms: 320,
    security_notes: [],
  }
  it('accepts valid response', () => {
    expect(ChatResponseSchema.safeParse(valid).success).toBe(true)
  })
  it('defaults security_notes to []', () => {
    const { security_notes: _, ...rest } = valid
    const r = ChatResponseSchema.safeParse(rest)
    expect(r.success && r.data.security_notes).toEqual([])
  })
  it('accepts cached=true with model_used=cache', () => {
    expect(ChatResponseSchema.safeParse({ ...valid, cached: true, model_used: 'cache' }).success).toBe(true)
  })
})

// ─── HealthResponse ───────────────────────────────────────────────────────────

describe('HealthResponseSchema', () => {
  it('accepts healthy', () => {
    expect(HealthResponseSchema.safeParse({
      status: 'healthy', environment: 'production',
      checks: { agent: true, security: true, cache: true },
    }).success).toBe(true)
  })
  it('accepts degraded', () => {
    expect(HealthResponseSchema.safeParse({
      status: 'degraded', environment: 'staging', checks: { agent: false },
    }).success).toBe(true)
  })
  it('rejects unknown status', () => {
    expect(HealthResponseSchema.safeParse({
      status: 'unknown', environment: 'prod', checks: {},
    }).success).toBe(false)
  })
})

// ─── MetricsResponse ──────────────────────────────────────────────────────────

describe('MetricsResponseSchema', () => {
  it('accepts valid metrics', () => {
    expect(MetricsResponseSchema.safeParse({
      total_requests: 1204, total_errors: 10,
      error_rate: '0.8%', avg_latency_ms: 340,
      cache_hit_rate: '68%', total_input_tokens: 50000, total_output_tokens: 30000,
    }).success).toBe(true)
  })
})

// ─── StreamEvent — all 6 types ────────────────────────────────────────────────

describe('StreamEventSchema', () => {
  it('token event', () => {
    expect(StreamEventSchema.safeParse({ event: 'token', data: { content: 'Paris' } }).success).toBe(true)
  })
  it('metadata event', () => {
    expect(StreamEventSchema.safeParse({
      event: 'metadata',
      data: { cached: false, model_used: 'primary', processing_time_ms: 320 },
    }).success).toBe(true)
  })
  it('security event', () => {
    expect(StreamEventSchema.safeParse({
      event: 'security', data: { notes: ['Input PII masked: email'] },
    }).success).toBe(true)
  })
  it('graph_node done with duration', () => {
    expect(StreamEventSchema.safeParse({
      event: 'graph_node', data: { node: 'llm_call', status: 'done', duration_ms: 318 },
    }).success).toBe(true)
  })
  it('graph_node skip without duration', () => {
    expect(StreamEventSchema.safeParse({
      event: 'graph_node', data: { node: 'cache_lookup', status: 'skip' },
    }).success).toBe(true)
  })
  it('done event with full response', () => {
    expect(StreamEventSchema.safeParse({
      event: 'done',
      data: { response: 'ok', thread_id: 'abc', model_used: 'primary', cached: false, processing_time_ms: 320, security_notes: [] },
    }).success).toBe(true)
  })
  it('error event', () => {
    expect(StreamEventSchema.safeParse({
      event: 'error', data: { message: 'Rate limit exceeded', code: 429 },
    }).success).toBe(true)
  })
  it('rejects unknown event type', () => {
    expect(StreamEventSchema.safeParse({ event: 'unknown', data: {} }).success).toBe(false)
  })
})

// ─── SSE Parser logic (inline, no import) ─────────────────────────────────────

async function collectSSE(raw: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(encoder.encode(raw)); c.close() },
  })
  const events: Array<{ event: string; data: unknown }> = []
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
      const dataLine = block.match(/^data: ([\s\S]+)$/m)?.[1]
      if (!dataLine) continue
      try { events.push({ event: eventLine ?? '', data: JSON.parse(dataLine) }) } catch { /* skip */ }
    }
  }
  return events
}

describe('SSE parser', () => {
  it('parses single token event', async () => {
    const evts = await collectSSE('event: token\ndata: {"content":"Paris"}\n\n')
    expect(evts).toHaveLength(1)
    expect(evts[0].event).toBe('token')
    expect((evts[0].data as Record<string, string>).content).toBe('Paris')
  })
  it('parses multiple events in one chunk', async () => {
    const raw = [
      'event: token\ndata: {"content":"Paris"}\n\n',
      'event: metadata\ndata: {"cached":false,"model_used":"primary","processing_time_ms":320}\n\n',
    ].join('')
    const evts = await collectSSE(raw)
    expect(evts).toHaveLength(2)
    expect(evts[1].event).toBe('metadata')
  })
  it('silently skips malformed JSON', async () => {
    const raw = 'event: token\ndata: BAD_JSON\n\nevent: token\ndata: {"content":"ok"}\n\n'
    const evts = await collectSSE(raw)
    expect(evts).toHaveLength(1)
    expect((evts[0].data as Record<string, string>).content).toBe('ok')
  })
  it('skips block with no data line', async () => {
    const raw = 'event: token\n\nevent: token\ndata: {"content":"x"}\n\n'
    const evts = await collectSSE(raw)
    expect(evts).toHaveLength(1)
  })
  it('handles empty input', async () => {
    const evts = await collectSSE('')
    expect(evts).toHaveLength(0)
  })
})

// ─── Formatters ───────────────────────────────────────────────────────────────

describe('formatMs', () => {
  it('sub-second', () => { expect(formatMs(320)).toBe('320ms') })
  it('seconds', () => { expect(formatMs(1500)).toBe('1.5s') })
  it('rounds', () => { expect(formatMs(0.4)).toBe('0ms') })
})

describe('formatNumber', () => {
  it('thousands', () => { expect(formatNumber(1204)).toBe('1.2K') })
  it('millions', () => { expect(formatNumber(1_500_000)).toBe('1.5M') })
  it('small', () => { expect(formatNumber(42)).toBe('42') })
})

describe('relativeTime', () => {
  it('just now for <1m', () => { expect(relativeTime(Date.now() - 30_000)).toBe('just now') })
  it('minutes ago', () => { expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5m ago') })
  it('hours ago', () => { expect(relativeTime(Date.now() - 2 * 3_600_000)).toBe('2h ago') })
  it('days ago', () => { expect(relativeTime(Date.now() - 3 * 86_400_000)).toBe('3d ago') })
})
