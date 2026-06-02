import * as React from 'react'
import { useRef, useEffect, useState } from 'react'

import type { Message } from '@/types'
import { useChatStore } from '@/stores/chat'
import { formatMs } from '@/lib/utils'
import { ExecutionTimeline } from '@/components/ExecutionTimeline'

// ─── CodeBlock Component ──────────────────────────────────────────────────────
interface CodeBlockProps {
  code: string
  language: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-2)',
      margin: '12px 0',
      overflow: 'hidden',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.8rem',
      boxShadow: 'var(--shadow)',
    }}>
      {/* Code Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--surface)',
        padding: '6px 14px',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}>
        <span>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--accent)' : 'var(--text-faint)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'color 120ms',
          }}
        >
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy code
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <pre style={{
        margin: 0,
        padding: '12px 14px',
        overflowX: 'auto',
        color: 'var(--text)',
        lineHeight: 1.5,
        textAlign: 'left',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─── Markdown Parser Functions ───────────────────────────────────────────────
function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} style={{
          background: 'var(--surface-2)',
          padding: '2px 5px',
          borderRadius: '4px',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
          border: '1px solid var(--border)'
        }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

function parseMarkdown(text: string) {
  if (!text) return null

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g)

  return parts.map((part, index) => {
    if (part.startsWith('```')) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/)
      const language = match ? match[1] : 'code'
      const code = match ? match[2] : part.slice(3, -3)

      return (
        <CodeBlock key={index} code={code.trim()} language={language || 'text'} />
      )
    }

    const lines = part.split('\n')
    return (
      <React.Fragment key={index}>
        {lines.map((line, lIdx) => {
          if (line.startsWith('### ')) {
            return <h3 key={lIdx} style={{ margin: '14px 0 8px 0', fontSize: '1.05rem', fontWeight: 600 }}>{parseInlineMarkdown(line.slice(4))}</h3>
          }
          if (line.startsWith('## ')) {
            return <h2 key={lIdx} style={{ margin: '18px 0 10px 0', fontSize: '1.2rem', fontWeight: 600 }}>{parseInlineMarkdown(line.slice(3))}</h2>
          }
          if (line.startsWith('# ')) {
            return <h1 key={lIdx} style={{ margin: '22px 0 12px 0', fontSize: '1.4rem', fontWeight: 700 }}>{parseInlineMarkdown(line.slice(2))}</h1>
          }

          if (line.startsWith('* ') || line.startsWith('- ')) {
            return (
              <li key={lIdx} style={{ marginLeft: '16px', listStyleType: 'disc', marginBottom: '4px' }}>
                {parseInlineMarkdown(line.slice(2))}
              </li>
            )
          }

          const orderedListMatch = line.match(/^(\d+)\.\s(.*)/)
          if (orderedListMatch) {
            return (
              <li key={lIdx} style={{ marginLeft: '16px', listStyleType: 'decimal', marginBottom: '4px' }}>
                {parseInlineMarkdown(orderedListMatch[2])}
              </li>
            )
          }

          if (line.startsWith('> ')) {
            return (
              <blockquote key={lIdx} style={{
                borderLeft: '3px solid var(--accent)',
                paddingLeft: '12px',
                color: 'var(--text-muted)',
                margin: '10px 0',
                fontStyle: 'italic'
              }}>
                {parseInlineMarkdown(line.slice(2))}
              </blockquote>
            )
          }

          if (line.trim() === '') {
            return <div key={lIdx} style={{ height: '8px' }} />
          }

          return <p key={lIdx} style={{ marginBottom: '8px', lineHeight: 1.7 }}>{parseInlineMarkdown(line)}</p>
        })}
      </React.Fragment>
    )
  })
}

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

// ─── ActionButtons ────────────────────────────────────────────────────────────
export function ActionButtons({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const { messages, activeThreadId, sendMessage, isStreaming } = useChatStore()
  const threadMsgs = messages[activeThreadId] ?? []

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleRegenerate = () => {
    if (isStreaming) return
    const index = threadMsgs.findIndex((m) => m.id === message.id)
    if (index > 0) {
      const prevMsg = threadMsgs[index - 1]
      if (prevMsg && prevMsg.role === 'user') {
        sendMessage(prevMsg.content)
      }
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      opacity: 0.65,
    }}>
      {/* Copy Button */}
      <button
        onClick={handleCopy}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.72rem',
          color: copied ? 'var(--accent)' : 'var(--text-faint)',
          cursor: 'pointer',
        }}
        title="Copy response"
      >
        {copied ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Copied</span>
          </>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {/* Thumbs Up Button */}
      <button
        onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          borderRadius: 4,
          color: feedback === 'up' ? 'var(--accent)' : 'var(--text-faint)',
          cursor: 'pointer',
          display: 'inline-flex',
        }}
        title="Good response"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>

      {/* Thumbs Down Button */}
      <button
        onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          borderRadius: 4,
          color: feedback === 'down' ? 'var(--error)' : 'var(--text-faint)',
          cursor: 'pointer',
          display: 'inline-flex',
        }}
        title="Bad response"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'scaleY(-1)' }}>
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>

      {/* Regenerate Button */}
      {!isStreaming && (
        <button
          onClick={handleRegenerate}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 4,
            borderRadius: 4,
            color: 'var(--text-faint)',
            cursor: 'pointer',
            display: 'inline-flex',
          }}
          title="Regenerate response"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      )}
    </div>
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
        {isUser ? message.content : parseMarkdown(message.content)}
        {message.isStreaming && message.content && <StreamingCursor />}
        {message.isStreaming && !message.content && (
          <span style={{ color: 'var(--text-faint)' }}>
            <span className="spinner" style={{ display: 'inline-block', marginRight: 6 }} />
          </span>
        )}
      </div>

      {!isUser && !message.isStreaming && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="message-meta">
            <ModelBadge cached={message.cached} model={message.model_used} ms={message.processing_time_ms} />
            {message.security_notes && message.security_notes.length > 0 && (
              <SecurityBadge notes={message.security_notes} />
            )}
          </div>
          <ActionButtons message={message} />
        </div>
      )}

      {/* Execution timeline — shown during and after streaming */}
      {!isUser && (message.isStreaming || message.processing_time_ms !== undefined) && (
        <ExecutionTimeline
          cached={message.cached}
          processing_time_ms={message.processing_time_ms}
          security_notes={message.security_notes}
          graphNodes={message.graphNodes}
        />
      )}
    </div>
  )
}

// ─── ChatInput ────────────────────────────────────────────────────────────────
export function ChatInput() {
  const [value, setValue] = useState('')
  const [selectedModel, setSelectedModel] = useState<'mistral' | 'llama3' | 'auto'>('mistral')
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  const { sendMessage, isStreaming } = useChatStore()
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px'
    }
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed && !selectedFile) return
    if (isStreaming) return
    
    // In a fully upgraded version, the selectedFile and webSearchEnabled states
    // would be packaged in the payload, but for now we send the text.
    setValue('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    
    let textToSend = trimmed
    if (selectedFile) {
      textToSend += `\n\n*(Sent with attached file: ${selectedFile.name})*`
    }
    sendMessage(textToSend)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const overLimit = value.length > 10000

  return (
    <div className="chat-input-area">
      <div className="chat-input-wrap">
        <div className="chat-input-box">
          {/* File Tag Attachment Row */}
          {selectedFile && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '4px 10px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginBottom: 8,
              alignSelf: 'flex-start',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.name}
              </span>
              <button
                onClick={handleRemoveFile}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-faint)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

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

          {/* Premium Controls Row */}
          <div className="chat-input-controls">
            <div className="chat-input-tools-left">
              {/* Attachment Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                className="btn-icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                style={{ padding: 6 }}
                title="Attach file"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              {/* Web Search Toggle */}
              <button
                className="btn-icon"
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                disabled={isStreaming}
                style={{
                  padding: 6,
                  color: webSearchEnabled ? 'var(--accent)' : 'var(--text-faint)',
                  background: webSearchEnabled ? 'var(--accent-dim)' : 'transparent',
                  borderRadius: '6px',
                }}
                title={webSearchEnabled ? "Web search enabled" : "Enable web search"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </button>

              {/* Model Selector */}
              <select
                value={selectedModel}
                onChange={(e: any) => setSelectedModel(e.target.value)}
                disabled={isStreaming}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="mistral">Mistral (Default)</option>
                <option value="llama3">LLaMA 3 (Fallback)</option>
                <option value="auto">Auto Router</option>
              </select>
            </div>

            <div className="chat-input-tools-right">
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={(!value.trim() && !selectedFile) || isStreaming || overLimit}
                style={{
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 'auto',
                }}
              >
                {isStreaming ? (
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
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
