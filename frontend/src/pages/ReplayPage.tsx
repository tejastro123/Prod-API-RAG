import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'
import { relativeTime, formatMs } from '@/lib/utils'
import type { Message } from '@/types'
import { DevNavbar } from '@/components/DevNavbar'

// ─── ReplayPage ────────────────────────────────────────────────────────────────
export function ReplayPage() {
  const { threads, messages } = useChatStore()
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const navigate = useNavigate()

  // Flatten all assistant messages with metadata across all threads
  type LogEntry = Message & { threadTitle: string; threadId: string }

  const entries: LogEntry[] = []
  for (const thread of threads) {
    const msgs = messages[thread.id] ?? []
    for (const msg of msgs) {
      if (msg.role === 'assistant' && msg.processing_time_ms !== undefined) {
        entries.push({ ...msg, threadTitle: thread.title, threadId: thread.id })
      }
    }
  }
  entries.sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px 0 20px' }}>
      <DevNavbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: log list */}
      <div style={{
        width: 340, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="topbar" style={{ flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div className="topbar-title">Request Audit Log</div>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            {entries.length} records
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: '0.82rem', textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>No requests yet</div>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/chat')}>
                Start chatting
              </button>
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                onClick={() => setSelected(e)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected?.id === e.id ? 'var(--surface-2)' : 'transparent',
                  transition: 'background 120ms',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)', flexShrink: 0 }}>
                    {relativeTime(e.timestamp)}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {e.cached && <span className="badge badge-blue">cached</span>}
                    {e.security_notes && e.security_notes.length > 0 && (
                      <span className="badge badge-amber">⚠ sec</span>
                    )}
                  </div>
                </div>
                <div style={{
                  fontSize: '0.82rem', color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.5,
                }}>
                  {e.content}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {e.model_used ?? 'unknown'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {formatMs(e.processing_time_ms ?? 0)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                    {e.threadTitle}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: detail view */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <RequestDetail entry={selected} onOpenThread={() => {
            navigate('/chat')
          }} />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-faint)', fontSize: '0.85rem', gap: 8,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.4 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            Select a request to inspect
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

// ─── RequestDetail ────────────────────────────────────────────────────────────
function RequestDetail({ entry, onOpenThread }: {
  entry: Message & { threadTitle: string; threadId: string }
  onOpenThread: () => void
}) {
  const [copied, setCopied] = useState(false)
  const { setActiveThread } = useChatStore()

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const jsonExport = JSON.stringify({
    id: entry.id,
    thread: entry.threadTitle,
    response: entry.content,
    model_used: entry.model_used,
    cached: entry.cached,
    processing_time_ms: entry.processing_time_ms,
    security_notes: entry.security_notes ?? [],
    timestamp: new Date(entry.timestamp).toISOString(),
  }, null, 2)

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            #{entry.id}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>
            {entry.threadTitle}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: 2 }}>
            {new Date(entry.timestamp).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => copy(jsonExport)}>
            {copied ? '✓ Copied' : 'Export JSON'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setActiveThread(entry.threadId)
            onOpenThread()
          }}>
            Open Thread
          </button>
        </div>
      </div>

      <hr className="divider" />

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Model', value: entry.model_used ?? '—' },
          { label: 'Latency', value: formatMs(entry.processing_time_ms ?? 0) },
          { label: 'Cache', value: entry.cached ? 'HIT' : 'MISS' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: '12px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Security notes */}
      {entry.security_notes && entry.security_notes.length > 0 && (
        <div>
          <div className="section-title">Security Notes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entry.security_notes.map((n, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: 'var(--warning-dim)',
                border: '1px solid var(--warning)', borderRadius: 'var(--radius)',
                fontSize: '0.82rem', color: 'var(--warning)',
              }}>
                {n}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response */}
      <div>
        <div className="section-title">Response</div>
        <div style={{
          padding: '14px 16px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          fontSize: '0.87rem', lineHeight: 1.7, color: 'var(--text)',
          whiteSpace: 'pre-wrap', maxHeight: 280, overflowY: 'auto',
        }}>
          {entry.content}
        </div>
      </div>

      {/* Raw JSON export */}
      <div>
        <div className="section-title">Raw JSON</div>
        <pre style={{
          padding: '14px 16px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)', overflowX: 'auto',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {jsonExport}
        </pre>
      </div>
    </div>
  )
}
