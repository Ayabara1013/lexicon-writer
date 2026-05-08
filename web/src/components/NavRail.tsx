type View = 'editor' | 'overview'

type Props = {
  activeView: View
  onNavigate: (view: View) => void
  userEmail: string | null
  onSignOut: () => void
}

const C = {
  deepest: '#0d0b18',
  border: '#2a2740',
  accent: '#7c6af7',
  accentLt: '#9d8ef9',
  accentBg: 'rgba(124,106,247,0.10)',
  textMut: '#55507a',
}

function IconWrite() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 14l2-5L12 2l3 3-7 7-5 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 4l4 4" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function IconOverview() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="2" rx="1" fill="currentColor" opacity="0.7"/>
      <rect x="2" y="7" width="10" height="2" rx="1" fill="currentColor" opacity="0.55"/>
      <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor" opacity="0.55"/>
      <rect x="2" y="15" width="7" height="2" rx="1" fill="currentColor" opacity="0.4"/>
    </svg>
  )
}

const NAV_ITEMS: { id: View; Icon: () => JSX.Element; label: string }[] = [
  { id: 'editor',   Icon: IconWrite,    label: 'Write' },
  { id: 'overview', Icon: IconOverview, label: 'Overview' },
]

export default function NavRail({ activeView, onNavigate, userEmail, onSignOut }: Props) {
  return (
    <div style={{
      width: 44, flexShrink: 0,
      background: C.deepest,
      borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 12, paddingBottom: 12, gap: 2,
    }}>
      {/* Logo */}
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'linear-gradient(135deg, #7c6af7, #a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 12l2.5-6L11 2l2 2-6.5 6.5L2 12z" fill="white" opacity="0.9"/>
          <circle cx="11.5" cy="2.5" r="1" fill="white"/>
        </svg>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
        {NAV_ITEMS.map(({ id, Icon, label }) => {
          const isActive = activeView === id
          return (
            <button
              key={id}
              title={label}
              onClick={() => onNavigate(id)}
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isActive ? C.accentLt : C.textMut,
                background: isActive ? C.accentBg : 'transparent',
                cursor: 'pointer', position: 'relative',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: -1, width: 2, height: 18,
                  background: C.accent, borderRadius: '0 2px 2px 0',
                }}/>
              )}
              <Icon />
            </button>
          )
        })}
      </div>

      {/* User avatar / sign out */}
      <button
        title={userEmail ? `Signed in as ${userEmail}\nClick to sign out` : 'Sign out'}
        onClick={onSignOut}
        style={{
          width: 28, height: 28, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #3d357a, #7c6af7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#e8e5f5', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          marginTop: 4,
        }}
      >
        {userEmail ? userEmail[0].toUpperCase() : '?'}
      </button>
    </div>
  )
}
