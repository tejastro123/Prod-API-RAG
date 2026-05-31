import type { MetricsResponse, HealthResponse, CacheStats } from '@/types';
export type LiveMetricsEvent = {
    type: 'metrics';
    data: MetricsResponse;
} | {
    type: 'health';
    data: HealthResponse;
} | {
    type: 'cache';
    data: CacheStats;
} | {
    type: 'error';
    message: string;
} | {
    type: 'connected';
};
type Listener = (event: LiveMetricsEvent) => void;
/**
 * Subscribes to live metrics via SSE (with polling fallback).
 *
 * The plan calls for push-based SSE from /api/metrics/stream.
 * Our backend doesn't have that endpoint yet, so we fall back to
 * polling /metrics, /health, and /cache/stats every 5 seconds.
 * When the backend adds the SSE endpoint, just set VITE_USE_METRICS_SSE=true.
 */
export declare function subscribeToMetrics(baseUrl: string, listener: Listener, intervalMs?: number): () => void;
export {};
