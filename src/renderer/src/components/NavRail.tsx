import type { View } from '../App'
import CloudSync from './CloudSync'

type Props = {
  activeView: View
  onNavigate: (view: View) => void
  onCloudSynced?: () => void
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
function IconCanvas() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="14" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="9" cy="14" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6 4h6M5.5 5.7L8 12.3M12.5 5.7L10 12.3" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}
function IconTimeline() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="5" cy="9" r="2" fill="currentColor" opacity="0.6"/>
      <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.8"/>
      <circle cx="13" cy="9" r="2" fill="currentColor"/>
      <line x1="5" y1="9" x2="5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
      <line x1="9" y1="9" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
      <line x1="13" y1="9" x2="13" y2="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2"/>
    </svg>
  )
}
function IconStats() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="11" width="3" height="5" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="7" y="7" width="3" height="9" rx="1" fill="currentColor" opacity="0.7"/>
      <rect x="12" y="3" width="3" height="13" rx="1" fill="currentColor"/>
    </svg>
  )
}
function IconGit() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="5" cy="13" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="13" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 7v4M5 7c0-1 3-3 6-2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}
function IconCorkboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

const C = {
  deepest: '#0d0b18',
  border: '#2a2740',
  accent: '#7c6af7',
  accentLt: '#9d8ef9',
  accentBg: 'rgba(124,106,247,0.10)',
  textMut: '#55507a',
}

const NAV_ITEMS: { id: View; Icon: () => JSX.Element; label: string }[] = [
  { id: 'editor',    Icon: IconWrite,     label: 'Write' },
  { id: 'overview',  Icon: IconOverview,  label: 'Overview' },
  { id: 'corkboard', Icon: IconCorkboard, label: 'Corkboard' },
  { id: 'canvas',    Icon: IconCanvas,    label: 'Canvas' },
  { id: 'timeline',  Icon: IconTimeline,  label: 'Timeline' },
  { id: 'stats',     Icon: IconStats,     label: 'Stats' },
  { id: 'history',   Icon: IconGit,       label: 'History' },
]

export default function NavRail({ activeView, onNavigate, onCloudSynced }: Props) {
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

      {/* Nav items */}
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

      {/* Cloud sync */}
      <CloudSync onSynced={onCloudSynced} />

      {/* Settings */}
      <button
        title="Settings"
        onClick={() => onNavigate('settings')}
        style={{
          width: 34, height: 34, borderRadius: 8, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: activeView === 'settings' ? C.accentLt : C.textMut,
          background: activeView === 'settings' ? C.accentBg : 'transparent',
          cursor: 'pointer', position: 'relative',
          transition: 'background 0.12s, color 0.12s',
        }}
      >
        {activeView === 'settings' && (
          <div style={{
            position: 'absolute', left: -1, width: 2, height: 18,
            background: C.accent, borderRadius: '0 2px 2px 0',
          }}/>
        )}
        <IconSettings />
      </button>
    </div>
  )
}
