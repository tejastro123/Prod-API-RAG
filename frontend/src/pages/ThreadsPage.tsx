import { useNavigate } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'
import { relativeTime } from '@/lib/utils'


export function ThreadsPage() {
  const { threads, activeThreadId, setActiveThread, deleteThread, createThread } = useChatStore()
  const navigate = useNavigate()

  const openThread = (id: string) => {
    setActiveThread(id)
    navigate('/chat')
  }

  const handleNew = () => {
    createThread()
    navigate('/chat')
  }

  return (
    <div className="threads-page">
      <div className="threads-inner">
        {/* Header */}
        <div className="topbar" style={{ height: 'auto', padding: '0 0 4px', border: 'none' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.1rem', marginBottom: 2 }}>Threads</h1>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
              {threads.length} conversation{threads.length !== 1 ? 's' : ''} · stored locally
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New thread
          </button>
        </div>

        {threads.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: 'var(--text-faint)', fontSize: '0.85rem',
          }}>
            <div style={{ marginBottom: 8 }}>No threads yet</div>
            <button className="btn btn-outline btn-sm" onClick={handleNew}>
              Start a conversation
            </button>
          </div>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              className={`thread-card ${t.id === activeThreadId ? 'active' : ''}`}
              onClick={() => openThread(t.id)}
            >
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                background: t.id === activeThreadId ? 'var(--accent-dim)' : 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: t.id === activeThreadId ? 'var(--accent)' : 'var(--text-faint)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>

              <div className="thread-card-info">
                <div className="thread-card-title">{t.title}</div>
                <div className="thread-card-meta">
                  <span>{t.messageCount} messages</span>
                  <span>·</span>
                  <span>{relativeTime(t.updatedAt)}</span>
                </div>
              </div>

              <button
                className="btn btn-danger btn-sm"
                onClick={(e) => { e.stopPropagation(); deleteThread(t.id) }}
                style={{ flexShrink: 0 }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
