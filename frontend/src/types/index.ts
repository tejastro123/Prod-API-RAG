import { z } from 'zod'

// ─── Request / Response Schemas ──────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  thread_id: z.string().default('default'),
})

export const ChatResponseSchema = z.object({
  response: z.string(),
  thread_id: z.string(),
  model_used: z.string(),
  cached: z.boolean(),
  processing_time_ms: z.number(),
  security_notes: z.array(z.string()).default([]),
})

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  environment: z.string(),
  version: z.string().optional(),
  checks: z.record(z.boolean()),
})

export const MetricsResponseSchema = z.object({
  total_requests: z.number(),
  total_errors: z.number(),
  error_rate: z.string(),
  avg_latency_ms: z.number(),
  cache_hit_rate: z.string(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
})

export const CacheStatsSchema = z.object({
  hits: z.number().optional(),
  misses: z.number().optional(),
  size: z.number().optional(),
  hit_rate: z.string().optional(),
}).passthrough()

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type ChatRequest     = z.infer<typeof ChatRequestSchema>
export type ChatResponse    = z.infer<typeof ChatResponseSchema>
export type HealthResponse  = z.infer<typeof HealthResponseSchema>
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>
export type CacheStats      = z.infer<typeof CacheStatsSchema>

// ─── UI Domain Types ──────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

export interface GraphNodeEvent {
  node: string
  status: 'start' | 'done' | 'skip' | 'error'
  duration_ms?: number
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  model_used?: string
  cached?: boolean
  processing_time_ms?: number
  security_notes?: string[]
  isStreaming?: boolean
  graphNodes?: GraphNodeEvent[]
}

export interface Thread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

// ─── Stream Event Schema ──────────────────────────────────────────────────────

export const StreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('token'),
    data: z.object({ content: z.string() }),
  }),
  z.object({
    event: z.literal('metadata'),
    data: z.object({
      cached: z.boolean(),
      model_used: z.string(),
      processing_time_ms: z.number(),
    }),
  }),
  z.object({
    event: z.literal('security'),
    data: z.object({ notes: z.array(z.string()) }),
  }),
  z.object({
    event: z.literal('graph_node'),
    data: z.object({
      node: z.string(),
      status: z.enum(['start', 'done', 'skip', 'error']),
      duration_ms: z.number().optional(),
    }),
  }),
  z.object({
    event: z.literal('done'),
    data: ChatResponseSchema,
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ message: z.string(), code: z.number() }),
  }),
])

export type StreamEvent = z.infer<typeof StreamEventSchema>
