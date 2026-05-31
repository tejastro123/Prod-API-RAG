import type { MetricsResponse, HealthResponse, CacheStats } from '@/types'

export type LiveMetricsEvent =
  | { type: 'metrics'; data: MetricsResponse }
  | { type: 'health'; data: HealthResponse }
  | { type: 'cache'; data: CacheStats }
  | { type: 'error'; message: string }
  | { type: 'connected' }

type Listener = (event: LiveMetricsEvent) => void

/**
 * Subscribes to live metrics via SSE (with polling fallback).
 *
 * The plan calls for push-based SSE from /api/metrics/stream.
 * Our backend doesn't have that endpoint yet, so we fall back to
 * polling /metrics, /health, and /cache/stats every 5 seconds.
 * When the backend adds the SSE endpoint, just set VITE_USE_METRICS_SSE=true.
 */
export function subscribeToMetrics(
  baseUrl: string,
  listener: Listener,
  intervalMs = 5000
): () => void {
  const useSSE = import.meta.env.VITE_USE_METRICS_SSE === 'true'

  if (useSSE) {
    // ── SSE path (future) ───────────────────────────────────────────────────
    const es = new EventSource(`${baseUrl}/metrics/stream`)

    es.addEventListener('metrics', (e) => {
      try { listener({ type: 'metrics', data: JSON.parse(e.data) }) } catch {}
    })
    es.addEventListener('health', (e) => {
      try { listener({ type: 'health', data: JSON.parse(e.data) }) } catch {}
    })
    es.addEventListener('cache', (e) => {
      try { listener({ type: 'cache', data: JSON.parse(e.data) }) } catch {}
    })
    es.addEventListener('error', () => {
      listener({ type: 'error', message: 'SSE stream error' })
    })

    listener({ type: 'connected' })
    return () => es.close()
  }

  // ── Polling fallback ──────────────────────────────────────────────────────
  let alive = true

  async function poll() {
    try {
      const [m, h, c] = await Promise.allSettled([
        fetch(`${baseUrl}/metrics`).then((r) => r.json()),
        fetch(`${baseUrl}/health`).then((r) => r.json()),
        fetch(`${baseUrl}/cache/stats`).then((r) => r.json()),
      ])

      if (!alive) return
      if (m.status === 'fulfilled') listener({ type: 'metrics', data: m.value })
      if (h.status === 'fulfilled') listener({ type: 'health', data: h.value })
      if (c.status === 'fulfilled') listener({ type: 'cache', data: c.value })
    } catch {
      if (alive) listener({ type: 'error', message: 'upstream unavailable' })
    }
  }

  // Immediate first poll
  poll()
  const timer = setInterval(poll, intervalMs)
  return () => { alive = false; clearInterval(timer) }
}
