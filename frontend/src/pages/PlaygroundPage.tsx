import { useState, useRef, useEffect } from 'react'
import { sendChatMessage, parseSSE } from '@/lib/api'
import { DevNavbar } from '@/components/DevNavbar'

// ─── PlaygroundPage ───────────────────────────────────────────────────────────
export function PlaygroundPage() {
  const [requestJson, setRequestJson] = useState(
    JSON.stringify({ message: 'What is retrieval-augmented generation?', thread_id: 'playground' }, null, 2)
  )
  const [response, setResponse] = useState<string>('')
  const [rawJson, setRawJson] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<number>(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [response])

  const send = async () => {
    setError(null)
    setResponse('')
    setRawJson('')
    setMetadata(null)
    setLatencyMs(null)
    setIsStreaming(true)

    let parsed: { message?: string; thread_id?: string } = {}
    try {
      parsed = JSON.parse(requestJson)
    } catch {
      setError('Invalid JSON in request body')
      setIsStreaming(false)
      return
    }

    if (!parsed.message?.trim()) {
      setError('"message" field is required and must be non-empty')
      setIsStreaming(false)
      return
    }

    startRef.current = Date.now()

    try {
      const res = await sendChatMessage(parsed.message, parsed.thread_id ?? 'playground')

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }))
        setError(err.detail ?? `HTTP ${res.status}`)
        setIsStreaming(false)
        return
      }

      const contentType = res.headers.get('content-type') ?? ''

      if (contentType.includes('text/event-stream') && res.body) {
        let acc = ''
        for await (const event of parseSSE(res.body)) {
          if (event.event === 'token') {
            acc += event.data.content
            setResponse(acc)
          } else if (event.event === 'done') {
            setMetadata({
              model_used: event.data.model_used,
              cached: event.data.cached,
              processing_time_ms: event.data.processing_time_ms,
              security_notes: event.data.security_notes,
            })
            setRawJson(JSON.stringify(event.data, null, 2))
            setLatencyMs(Date.now() - startRef.current)
          } else if (event.event === 'error') {
            setError(event.data.message)
          }
        }
      } else {
        const data = await res.json()
        setResponse(data.response ?? '')
        setMetadata({
          model_used: data.model_used,
          cached: data.cached,
          processing_time_ms: data.processing_time_ms,
          security_notes: data.security_notes,
        })
        setRawJson(JSON.stringify(data, null, 2))
        setLatencyMs(Date.now() - startRef.current)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsStreaming(false)
    }
  }

  const parseErr = (() => {
    try { JSON.parse(requestJson); return null } catch (e: unknown) {
      return e instanceof Error ? e.message : 'Invalid JSON'
    }
  })()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px 0 20px' }}>
      <DevNavbar />
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-title">API Playground</div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
          POST /api/chat
        </span>
      </div>

      {/* Split pane */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

        {/* Left — Request editor */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Request Body
            </span>
            {parseErr && (
              <span style={{ fontSize: '0.72rem', color: 'var(--error)' }}>⚠ {parseErr}</span>
            )}
          </div>

          <textarea
            value={requestJson}
            onChange={(e) => setRequestJson(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, resize: 'none', background: 'transparent', border: 'none',
              outline: 'none', padding: '14px 16px', fontFamily: 'var(--font-mono)',
              fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.6,
            }}
          />

          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <button
              className="btn btn-primary"
              style={{ minWidth: 80 }}
              onClick={send}
              disabled={isStreaming || !!parseErr}
            >
              {isStreaming
                ? <><span className="spinner" /> Sending…</>
                : '▶ Send'}
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              Ctrl+Enter to send
            </span>
            {latencyMs !== null && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)' }}>
                {latencyMs}ms wall clock
              </span>
            )}
          </div>
        </div>

        {/* Right — Response */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Response tab bar */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <button
              className={`btn btn-sm ${!showRaw ? 'btn-outline' : 'btn-ghost'}`}
              onClick={() => setShowRaw(false)}
            >
              Response
            </button>
            <button
              className={`btn btn-sm ${showRaw ? 'btn-outline' : 'btn-ghost'}`}
              onClick={() => setShowRaw(true)}
              disabled={!rawJson}
            >
              Raw JSON
            </button>

            {metadata && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {metadata.cached
                  ? <span className="badge badge-blue">cached</span>
                  : <span className="badge badge-muted">{String(metadata.model_used ?? 'primary')}</span>
                }
                {typeof metadata.processing_time_ms === 'number' && (
                  <span className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                    {Math.round(metadata.processing_time_ms as number)}ms
                  </span>
                )}
                {Array.isArray(metadata.security_notes) && (metadata.security_notes as string[]).length > 0 && (
                  <span className="badge badge-amber">⚠ sec</span>
                )}
              </div>
            )}
          </div>

          {/* Response content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {error ? (
              <div style={{
                padding: '12px 14px', background: 'var(--error-dim)',
                border: '1px solid var(--error)', borderRadius: 'var(--radius)',
                color: 'var(--error)', fontSize: '0.85rem',
              }}>
                ⚠ {error}
              </div>
            ) : showRaw ? (
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
              }}>
                {rawJson || <span style={{ color: 'var(--text-faint)' }}>No response yet</span>}
              </pre>
            ) : (
              <div style={{
                fontFamily: 'var(--font-sans)', fontSize: '0.9rem',
                color: response ? 'var(--text)' : 'var(--text-faint)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                {response || (isStreaming
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> generating…</span>
                  : 'Send a request to see the response here'
                )}
                {isStreaming && response && <span className="cursor-blink" />}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
