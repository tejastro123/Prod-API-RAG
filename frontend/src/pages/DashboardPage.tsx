import { useLiveMetrics } from '@/lib/useLiveMetrics'
import { useChatStore } from '@/stores/chat'
import { formatMs, formatNumber } from '@/lib/utils'


// ─── MiniSparkline (inline SVG, no external lib) ─────────────────────────────
function Sparkline({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values) || 1
  const w = 120, h = 32
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - (v / max) * h}`
  ).join(' ')

  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, accent, history,
}: {
  label: string; value: string; sub?: string; accent?: boolean; history?: number[]
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={accent ? { color: 'var(--accent)' } : {}}>
        {value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
      {history && history.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <Sparkline values={history} color={accent ? 'var(--accent)' : 'var(--text-faint)'} />
        </div>
      )}
    </div>
  )
}

// ─── DashboardPage ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { metrics, health, cache, error, lastUpdated } = useLiveMetrics()

  const isHealthy = health?.status === 'healthy'

  return (
    <div className="dashboard-page">
      <div className="dashboard-inner">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.1rem', marginBottom: 2 }}>System Dashboard</h1>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
              Push updates every 5s · prod-api-rag.onrender.com
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {error ? (
              <span className="badge badge-red">⚠ {error}</span>
            ) : (
              <span className="badge badge-green">● live</span>
            )}
            {lastUpdated && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="status-bar">
          <div className="status-item">
            <span className={`dot ${isHealthy ? 'dot-green' : health ? 'dot-red' : 'dot-muted'}`} />
            <strong>{health?.status ?? 'connecting…'}</strong>
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
              sub={metrics ? `${metrics.total_errors} total errors` : undefined}
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
                  { label: 'Input tokens',  value: metrics.total_input_tokens },
                  { label: 'Output tokens', value: metrics.total_output_tokens },
                  {
                    label: 'Total tokens',
                    value: metrics.total_input_tokens + metrics.total_output_tokens,
                  },
                ].map(({ label, value }) => {
                  const total = (metrics.total_input_tokens + metrics.total_output_tokens) || 1
                  const pct = (value / total) * 100
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
                          background: 'var(--accent)', borderRadius: 99,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>Connecting…</div>
            )}
          </div>

          {/* Health checks + Cache */}
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
              </div>
            ) : (
              <div style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>Connecting…</div>
            )}

            {cache && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div className="section-title" style={{ marginBottom: 8 }}>Cache</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(cache)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {k.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                          {String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security audit section */}
        <div className="card">
          <div className="section-title">Security Audit Log</div>
          <SecurityAuditLog />
        </div>

      </div>
    </div>
  )
}

// ─── SecurityAuditLog ─────────────────────────────────────────────────────────
// Pulls security notes from all stored messages across threads
function SecurityAuditLog() {
  const { messages, threads } = useChatStore()

  type SecurityEntry = {
    threadTitle: string
    content: string
    notes: string[]
    timestamp: number
  }

  const entries: SecurityEntry[] = []

  for (const thread of threads) {
    const msgs = messages[thread.id] ?? []
    for (const msg of msgs) {
      if (msg.security_notes && msg.security_notes.length > 0) {
        entries.push({
          threadTitle: thread.title,
          content: msg.content.slice(0, 80),
          notes: msg.security_notes,
          timestamp: msg.timestamp,
        })
      }
    }
  }

  // Sort newest first
  entries.sort((a, b) => b.timestamp - a.timestamp)

  const piiCount     = entries.reduce((n, e) => n + e.notes.filter(s => s.toLowerCase().includes('pii')).length, 0)
  const blockedCount = entries.filter(e => e.notes.some(s => s.toLowerCase().includes('block'))).length

  if (entries.length === 0) {
    return (
      <div style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>
        No security events recorded yet.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warning)', marginRight: 6 }}>{piiCount}</span>
          PII events
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--error)', marginRight: 6 }}>{blockedCount}</span>
          blocked
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginRight: 6 }}>{entries.length}</span>
          total
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        {entries.map((e, i) => (
          <div key={i} style={{
            padding: '10px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.82rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem' }}>{e.threadTitle}</span>
              <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{e.content}{e.content.length >= 80 ? '…' : ''}"
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {e.notes.map((n, j) => (
                <span key={j} className="badge badge-amber">{n}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
