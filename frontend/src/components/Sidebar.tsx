import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'

export function Sidebar() {
  const { threads, activeThreadId, createThread, deleteThread, setActiveThread, renameThread } = useChatStore()
  const navigate = useNavigate()

  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingThreadId])

  const handleNewThread = () => {
    createThread()
    navigate('/chat')
  }

  const handleThreadClick = (id: string) => {
    setActiveThread(id)
    navigate('/chat')
  }

  const handleStartEdit = (id: string, currentTitle: string) => {
    setEditingThreadId(id)
    setEditTitle(currentTitle)
  }

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      renameThread(id, editTitle.trim())
    }
    setEditingThreadId(null)
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          RAG Agent
        </div>
        <button className="btn-icon" onClick={handleNewThread} title="New Chat">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
        </NavLink>
      </nav>

      {/* Thread list */}
      <div className="sidebar-threads" style={{ flex: 1, overflowY: 'auto' }}>
        {threads.length > 0 && (
          <div className="threads-label">Recent Chats</div>
        )}
        {threads.slice(0, 30).map((t) => (
          <div
            key={t.id}
            className={`thread-item ${t.id === activeThreadId ? 'active' : ''}`}
            onClick={() => handleThreadClick(t.id)}
            onDoubleClick={() => handleStartEdit(t.id, t.title)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ flexShrink: 0, color: 'var(--text-faint)' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            
            {editingThreadId === t.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleSaveEdit(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(t.id)
                  if (e.key === 'Escape') setEditingThreadId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-active)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  fontSize: '0.78rem',
                  padding: '2px 6px',
                  width: '100%',
                  outline: 'none',
                }}
              />
            ) : (
              <>
                <span className="thread-title">{t.title}</span>
                <div className="thread-actions" style={{ display: 'flex', gap: 2 }}>
                  <button
                    className="btn-icon"
                    style={{ width: 22, height: 22, padding: 2, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartEdit(t.id, t.title)
                    }}
                    title="Rename thread"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon thread-delete"
                    style={{ width: 22, height: 22, padding: 2, flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); deleteThread(t.id) }}
                    title="Delete thread"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {threads.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
            No chat threads yet
          </div>
        )}
      </div>

      {/* Developer Console Link */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ fontSize: '0.78rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          Developer Console
        </NavLink>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <span className="dot dot-green" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
            prod-api-rag.onrender.com
          </span>
        </div>
      </div>
    </aside>
  )
}
