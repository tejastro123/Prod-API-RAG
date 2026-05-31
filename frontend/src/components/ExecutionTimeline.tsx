import { useState } from 'react'
import { formatMs } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphNodeEvent {
  node: string
  status: 'start' | 'done' | 'skip' | 'error'
  duration_ms?: number
}

interface TimelineNode {
  node: string
  label: string
  status: 'done' | 'skip' | 'error' | 'pending'
  duration_ms?: number
}

// ─── Build timeline from response metadata ────────────────────────────────────
// When the backend doesn't emit graph_node events, we infer the pipeline
// from the response metadata (cached, security_notes, processing_time_ms).

export function inferTimeline(opts: {
  cached?: boolean
  processing_time_ms?: number
  security_notes?: string[]
  graphNodes?: GraphNodeEvent[]   // populated when backend sends graph_node events
}): TimelineNode[] {
  const { cached, processing_time_ms = 0, security_notes = [], graphNodes } = opts

  // ── If we have real graph_node events, use them ──────────────────────────
  if (graphNodes && graphNodes.length > 0) {
    return graphNodes.map((n) => ({
      node: n.node,
      label: formatNodeLabel(n.node),
      status: n.status === 'start' ? 'pending' : n.status,
      duration_ms: n.duration_ms,
    }))
  }

  // ── Infer from response metadata (no graph_node events from backend yet) ─
  const hasPii     = security_notes.some(n => n.toLowerCase().includes('pii'))
  const hasBlocked = security_notes.some(n => n.toLowerCase().includes('block'))

  // rough apportionment: security ~2ms, cache lookup ~1ms, rest goes to LLM
  const secMs  = 2
  const cacheMs = 1
  const llmMs  = Math.max(0, processing_time_ms - secMs - cacheMs - 1)

  return [
    {
      node: 'security_check',
      label: 'Security Scan',
      status: hasBlocked ? 'error' : 'done',
      duration_ms: secMs,
    },
    {
      node: 'cache_lookup',
      label: 'Cache Lookup',
      status: cached ? 'done' : 'skip',
      duration_ms: cacheMs,
    },
    ...(!cached ? [
      {
        node: 'llm_call',
        label: 'LLM Call',
        status: 'done' as const,
        duration_ms: llmMs,
      },
      {
        node: 'output_filter',
        label: 'Output Filter',
        status: hasPii ? 'done' as const : 'done' as const,
        duration_ms: 1,
      },
    ] : []),
    {
      node: 'response',
      label: 'Response',
      status: 'done' as const,
      duration_ms: undefined,
    },
  ]
}

function formatNodeLabel(node: string) {
  return node
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Status styles ────────────────────────────────────────────────────────────

function nodeColor(status: TimelineNode['status']): string {
  if (status === 'done')    return 'var(--accent)'
  if (status === 'skip')    return 'var(--text-faint)'
  if (status === 'error')   return 'var(--error)'
  return 'var(--warning)'
}

function nodeLabel(status: TimelineNode['status'], cached: boolean | undefined, node: string): string {
  if (node === 'cache_lookup' && status === 'done') return cached ? 'hit' : '✓'
  if (node === 'cache_lookup' && status === 'skip') return 'miss'
  if (status === 'done')    return '✓'
  if (status === 'skip')    return '↷'
  if (status === 'error')   return '✕'
  return '…'
}

// ─── ExecutionTimeline ────────────────────────────────────────────────────────

interface ExecutionTimelineProps {
  cached?: boolean
  processing_time_ms?: number
  security_notes?: string[]
  graphNodes?: GraphNodeEvent[]
}

export function ExecutionTimeline({
  cached,
  processing_time_ms,
  security_notes,
  graphNodes,
}: ExecutionTimelineProps) {
  const [expanded, setExpanded] = useState(false)

  const nodes = inferTimeline({ cached, processing_time_ms, security_notes, graphNodes })
  const totalMs = nodes.reduce((s, n) => s + (n.duration_ms ?? 0), 0)

  return (
    <div style={{ marginTop: 6 }}>
      {/* Collapsed toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', fontSize: '0.72rem', padding: '2px 0',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
        >
          <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        execution pipeline
        {!expanded && (
          <span style={{ color: 'var(--text-faint)' }}>
            · {formatMs(totalMs)}
          </span>
        )}
      </button>

      {/* Expanded timeline */}
      {expanded && (
        <div style={{
          marginTop: 10,
          padding: '12px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          animation: 'fadeUp 150ms cubic-bezier(0.22,1,0.36,1) both',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {nodes.map((n, i) => (
              <div key={n.node} style={{ display: 'flex', gap: 0 }}>
                {/* Vertical connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 10, flexShrink: 0 }}>
                  {/* Node dot */}
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: n.status === 'skip' ? 'var(--surface-2)' : `${nodeColor(n.status)}22`,
                    border: `1.5px solid ${nodeColor(n.status)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', color: nodeColor(n.status), fontWeight: 600,
                    flexShrink: 0,
                    transition: 'border-color 200ms',
                  }}>
                    {nodeLabel(n.status, cached, n.node)}
                  </div>
                  {/* Vertical line (not for last) */}
                  {i < nodes.length - 1 && (
                    <div style={{
                      width: 1, flex: 1, minHeight: 14,
                      background: n.status === 'skip' ? 'var(--border)' : 'var(--border-2)',
                      margin: '2px 0',
                    }} />
                  )}
                </div>

                {/* Node content */}
                <div style={{
                  paddingBottom: i < nodes.length - 1 ? 14 : 0,
                  paddingTop: 2,
                  minWidth: 0,
                  flex: 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                      fontSize: '0.82rem',
                      color: n.status === 'skip' ? 'var(--text-faint)' : 'var(--text)',
                      fontWeight: 500,
                    }}>
                      {n.label}
                    </span>
                    {n.duration_ms !== undefined && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-faint)',
                      }}>
                        {formatMs(n.duration_ms)}
                      </span>
                    )}
                    {n.node === 'cache_lookup' && (
                      <span className={`badge ${cached ? 'badge-blue' : 'badge-muted'}`} style={{ fontSize: '0.65rem' }}>
                        {cached ? 'HIT' : 'MISS'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 12, fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)', color: 'var(--text-faint)',
          }}>
            <span>total <strong style={{ color: 'var(--text)' }}>{formatMs(totalMs)}</strong></span>
            {cached && <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>served from cache</span>}
          </div>
        </div>
      )}
    </div>
  )
}
