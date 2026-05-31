import * as React from 'react'
import { useRef, useEffect, useState } from 'react'

import type { Message } from '@/types'
import { useChatStore } from '@/stores/chat'
import { formatMs } from '@/lib/utils'
import { ExecutionTimeline } from '@/components/ExecutionTimeline'

// ─── StreamingCursor ──────────────────────────────────────────────────────────
export function StreamingCursor() {
  return <span className="cursor-blink" aria-hidden />
}

// ─── SecurityBadge ────────────────────────────────────────────────────────────
export function SecurityBadge({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="badge badge-amber"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', border: 'none' }}
      >
        ⚠ {notes.length} security note{notes.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '120%', left: 0, zIndex: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '12px 14px',
          minWidth: '280px', maxWidth: '400px', boxShadow: 'var(--shadow-lg)',
        }}>
          {notes.map((n, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: 'var(--warning)', marginBottom: i < notes.length - 1 ? 6 : 0 }}>
              • {n}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

// ─── ModelBadge ───────────────────────────────────────────────────────────────
export function ModelBadge({ cached, model, ms }: { cached?: boolean; model?: string; ms?: number }) {
  if (!model && ms === undefined) return null
  const label = [
    cached ? 'cached' : model ?? 'primary',
    ms !== undefined ? formatMs(ms) : null,
  ].filter(Boolean).join(' · ')
  return (
    <span className={`badge ${cached ? 'badge-blue' : 'badge-muted'}`}>
      {label}
    </span>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className="message fade-up">
      <div className="message-header">
        <span className="message-role" style={{ color: isUser ? 'var(--text-faint)' : 'var(--accent)' }}>
          {isUser ? 'you' : 'assistant'}
        </span>
        {!isUser && message.isStreaming && (
          <span className="badge badge-muted" style={{ fontSize: '0.68rem' }}>
            <span className="spinner" style={{ width: 10, height: 10 }} /> generating
          </span>
        )}
      </div>

      <div
        className="message-body"
        style={{
          paddingLeft: '2px',
          opacity: message.isStreaming && !message.content ? 0.5 : 1,
        }}
      >
        {message.content || (message.isStreaming ? '' : '—')}
        {message.isStreaming && message.content && <StreamingCursor />}
        {message.isStreaming && !message.content && (
          <span style={{ color: 'var(--text-faint)' }}>
            <span className="spinner" style={{ display: 'inline-block', marginRight: 6 }} />
          </span>
        )}
      </div>

      {!isUser && !message.isStreaming && (
        <div className="message-meta">
          <ModelBadge cached={message.cached} model={message.model_used} ms={message.processing_time_ms} />
          {message.security_notes && message.security_notes.length > 0 && (
            <SecurityBadge notes={message.security_notes} />
          )}
        </div>
      )}

      {/* Execution timeline — shown after streaming completes */}
      {!isUser && !message.isStreaming && message.processing_time_ms !== undefined && (
        <ExecutionTimeline
          cached={message.cached}
          processing_time_ms={message.processing_time_ms}
          security_notes={message.security_notes}
        />
      )}
    </div>
  )
}

// ─── ChatInput ────────────────────────────────────────────────────────────────
export function ChatInput() {
  const [value, setValue] = useState('')
  const { sendMessage, isStreaming } = useChatStore()
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px'
    }
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    setValue('')
    sendMessage(trimmed)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const overLimit = value.length > 10000


  return (
    <div className="chat-input-area">
      <div className="chat-input-wrap">
        <div className="chat-input-box">
          <textarea
            ref={ref}
            className="chat-textarea"
            placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isStreaming}
            rows={1}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!value.trim() || isStreaming || overLimit}
            style={{ flexShrink: 0, alignSelf: 'flex-end' }}
          >
            {isStreaming ? <span className="spinner" /> : '↑'}
          </button>
        </div>
        <div className="chat-footer">
          <span className="text-xs text-faint">Enter to send · Shift+Enter for newline</span>
          <span className={`char-count ${overLimit ? 'text-error' : ''}`}>
            {value.length.toLocaleString()} / 10,000
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── MessagesArea ─────────────────────────────────────────────────────────────
export function MessagesArea() {
  const { messages, activeThreadId } = useChatStore()
  const threadMsgs = messages[activeThreadId] ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMsgs])

  if (threadMsgs.length === 0) {
    return (
      <div className="messages-area">
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="empty-title">Start a conversation</div>
          <div className="empty-sub">
            Ask anything. Your RAG agent will search, reason, and respond with context-aware answers.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="messages-area">
      <div className="messages-inner">
        {threadMsgs.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
