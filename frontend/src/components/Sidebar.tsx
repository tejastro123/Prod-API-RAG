import { NavLink, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'


export function Sidebar() {
  const { threads, activeThreadId, createThread, deleteThread, setActiveThread } = useChatStore()
  const navigate = useNavigate()

  const handleNewThread = () => {
    createThread()
    navigate('/chat')
  }

  const handleThreadClick = (id: string) => {
    setActiveThread(id)
    navigate('/chat')
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
        <button className="btn-icon" onClick={handleNewThread} title="New thread">
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
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="2" y="3" width="7" height="9" rx="1" /><rect x="2" y="14" width="7" height="7" rx="1" />
            <rect x="13" y="3" width="9" height="4" rx="1" /><rect x="13" y="10" width="9" height="11" rx="1" />
          </svg>
          Dashboard
        </NavLink>
        <NavLink to="/threads" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          Threads
        </NavLink>
        <NavLink to="/replay" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          Replay
        </NavLink>
        <NavLink to="/playground" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          Playground
        </NavLink>

      </nav>

      {/* Thread list */}
      <div className="sidebar-threads">
        {threads.length > 0 && (
          <div className="threads-label">Recent</div>
        )}
        {threads.slice(0, 30).map((t) => (
          <div
            key={t.id}
            className={`thread-item ${t.id === activeThreadId ? 'active' : ''}`}
            onClick={() => handleThreadClick(t.id)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ flexShrink: 0, color: 'var(--text-faint)' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="thread-title">{t.title}</span>
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
        ))}
        {threads.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
            No threads yet
          </div>
        )}
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
