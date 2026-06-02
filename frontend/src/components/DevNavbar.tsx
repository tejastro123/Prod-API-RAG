import { NavLink } from 'react-router-dom'

export function DevNavbar() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderBottom: '1px solid var(--border)',
      paddingBottom: 14,
      marginBottom: 24,
      width: '100%',
    }}>
      <div style={{
        marginRight: 16,
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--text-faint)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Developer Tools
      </div>
      
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `dev-tab ${isActive ? 'active' : ''}`}
        style={({ isActive }) => ({
          fontSize: '0.8rem',
          textDecoration: 'none',
          padding: '6px 12px',
          borderRadius: 'var(--radius)',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
          transition: 'all 120ms',
          fontWeight: isActive ? 600 : 500,
        })}
      >
        Telemetry & Stats
      </NavLink>

      <NavLink
        to="/playground"
        className={({ isActive }) => `dev-tab ${isActive ? 'active' : ''}`}
        style={({ isActive }) => ({
          fontSize: '0.8rem',
          textDecoration: 'none',
          padding: '6px 12px',
          borderRadius: 'var(--radius)',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
          transition: 'all 120ms',
          fontWeight: isActive ? 600 : 500,
        })}
      >
        LLM Playground
      </NavLink>

      <NavLink
        to="/replay"
        className={({ isActive }) => `dev-tab ${isActive ? 'active' : ''}`}
        style={({ isActive }) => ({
          fontSize: '0.8rem',
          textDecoration: 'none',
          padding: '6px 12px',
          borderRadius: 'var(--radius)',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
          transition: 'all 120ms',
          fontWeight: isActive ? 600 : 500,
        })}
      >
        Replay Audit
      </NavLink>

      <NavLink
        to="/threads"
        className={({ isActive }) => `dev-tab ${isActive ? 'active' : ''}`}
        style={({ isActive }) => ({
          fontSize: '0.8rem',
          textDecoration: 'none',
          padding: '6px 12px',
          borderRadius: 'var(--radius)',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
          transition: 'all 120ms',
          fontWeight: isActive ? 600 : 500,
        })}
      >
        Threads Admin
      </NavLink>
    </div>
  )
}
