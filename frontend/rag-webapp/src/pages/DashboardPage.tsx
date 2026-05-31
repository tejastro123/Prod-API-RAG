import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchMetrics, fetchCacheStats } from '@/lib/api'
import { formatMs, formatNumber } from '@/lib/utils'
import type { MetricsResponse, HealthResponse, CacheStats } from '@/types'

function MetricCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={accent ? { color: 'var(--accent)' } : {}}>
        {value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  )
}

export function DashboardPage() {
  const { data: health, isLoading: healthLoading } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  })

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricsResponse>({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 10_000,
  })

  const { data: cache } = useQuery<CacheStats>({
    queryKey: ['cache-stats'],
    queryFn: fetchCacheStats,
    refetchInterval: 10_000,
  })

  const isHealthy = health?.status === 'healthy'
  const loading = healthLoading || metricsLoading

  return (
    <div className="dashboard-page">
      <div className="dashboard-inner">
        {/* Header */}
        <div className="topbar" style={{ height: 'auto', padding: '0 0 4px', border: 'none' }}>
          <div>
            <h1 style={{ fontSize: '1.1rem', marginBottom: 2 }}>System Dashboard</h1>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
              Auto-refreshes every 10s · prod-api-rag.onrender.com
            </div>
          </div>
          {loading && <span className="spinner" />}
        </div>

        {/* Status bar */}
        <div className="status-bar">
          <div className="status-item">
            <span className={`dot ${isHealthy ? 'dot-green' : health ? 'dot-red' : 'dot-muted'}`} />
            <strong>{health?.status ?? 'checking…'}</strong>
          </div>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          {health?.checks && Object.entries(health.checks).map(([k, v]) => (
            <div key={k} className="status-item">
              <span className={`dot ${v ? 'dot-green' : 'dot-red'}`} />
              {k}
            </div>
          ))}
          {health?.environment && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
              <span className="badge badge-muted">{health.environment}</span>
            </>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <span className="badge badge-muted">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Metrics grid */}
        <div>
          <div className="section-title">Request Metrics</div>
          <div className="metrics-grid">
            <MetricCard
              label="Total Requests"
              value={metrics ? formatNumber(metrics.total_requests) : '—'}
              sub="all time"
              accent
            />
            <MetricCard
              label="Error Rate"
              value={metrics?.error_rate ?? '—'}
              sub={metrics ? `${metrics.total_errors} errors` : undefined}
            />
            <MetricCard
              label="Avg Latency"
              value={metrics ? formatMs(metrics.avg_latency_ms) : '—'}
              sub="per request"
            />
            <MetricCard
              label="Cache Hit Rate"
              value={metrics?.cache_hit_rate ?? '—'}
              sub="of all requests"
            />
          </div>
        </div>

        {/* Token usage + Health checks */}
        <div className="dashboard-row">
          {/* Token usage */}
          <div className="card">
            <div className="section-title">Token Usage</div>
            {metrics ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Input tokens', value: metrics.total_input_tokens },
                  { label: 'Output tokens', value: metrics.total_output_tokens },
                  { label: 'Total tokens', value: metrics.total_input_tokens + metrics.total_output_tokens },
                ].map(({ label, value }) => {
                  const max = metrics.total_input_tokens + metrics.total_output_tokens || 1
                  const pct = (value / max) * 100
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                          {formatNumber(value)}
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: 'var(--accent)',
                          borderRadius: 99,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>Loading…</div>
            )}
          </div>

          {/* Health checks */}
          <div className="card">
            <div className="section-title">Component Health</div>
            {health?.checks ? (
              <div className="health-check-list">
                {Object.entries(health.checks).map(([name, ok]) => (
                  <div key={name} className="health-check-item">
                    <span className="health-check-name">{name}</span>
                    <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>
                      {ok ? '● operational' : '● degraded'}
                    </span>
                  </div>
                ))}
                {cache && (
                  <div className="health-check-item" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <span className="health-check-name" style={{ color: 'var(--text-faint)', fontSize: '0.78rem' }}>
                      Cache size: {typeof cache.size === 'number' ? cache.size : '—'} entries
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>Loading…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
