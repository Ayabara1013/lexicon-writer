import { useState, useEffect } from 'react'

type SyncState = 'idle' | 'syncing' | 'error'

type Props = {
  onSynced?: () => void
}

const C = {
  deepest: '#0d0b18',
  bg: '#1a1825',
  border: '#2a2740',
  accent: '#7c6af7',
  accentLt: '#9d8ef9',
  textMut: '#55507a',
  text: '#e8e5f5',
  error: '#f87171',
  success: '#4ade80',
}

function IconCloud({ state, email }: { state: SyncState; email: string | null }) {
  const color = !email ? C.textMut : state === 'error' ? C.error : state === 'syncing' ? C.accentLt : C.success
  if (state === 'syncing') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color }}>
        <path d="M3 10a3.5 3.5 0 01.5-6.9A4 4 0 0112 5a2.5 2.5 0 010 5H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M6 9l2-2 2 2" stroke={C.accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse 1s ease-in-out infinite' }}/>
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color }}>
      <path d="M3 10a3.5 3.5 0 01.5-6.9A4 4 0 0112 5a2.5 2.5 0 010 5H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      {email && state !== 'error' && (
        <path d="M6 9l1.5 1.5L10 7.5" stroke={C.success} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}

export default function CloudSync({ onSynced }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    window.api.cloud.session().then(({ email: e, lastSync: ls }) => {
      setEmail(e)
      setLastSync(ls)
    })
  }, [])

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    const result = await window.api.cloud.signIn(loginEmail, loginPassword)
    setLoginLoading(false)
    if (result.error) {
      setLoginError(result.error)
    } else {
      setEmail(result.email)
      setLoginPassword('')
      setSyncMsg('')
      runSync()
    }
  }

  async function handleLogout() {
    await window.api.cloud.signOut()
    setEmail(null)
    setLastSync(null)
    setSyncMsg('')
  }

  async function runSync() {
    setSyncState('syncing')
    setSyncMsg('')
    const push = await window.api.cloud.push()
    if (push.error) { setSyncState('error'); setSyncMsg(push.error); return }
    const pull = await window.api.cloud.pull()
    if (pull.error) { setSyncState('error'); setSyncMsg(pull.error); return }
    const ls = await window.api.cloud.session().then((s) => s.lastSync)
    setLastSync(ls)
    setSyncState('idle')
    setSyncMsg(`Synced — ${push.pushed} pushed, ${pull.pulled} pulled`)
    onSynced?.()
  }

  function formatLastSync(iso: string | null): string {
    if (!iso) return 'Never synced'
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'Synced just now'
    if (diff < 3600000) return `Synced ${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `Synced ${Math.floor(diff / 3600000)}h ago`
    return `Synced ${d.toLocaleDateString()}`
  }

  return (
    <>
      <button
        title={email ? `Cloud sync — ${email}` : 'Sign in for cloud sync'}
        onClick={() => setOpen(true)}
        style={{
          width: 34, height: 34, borderRadius: 8, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,106,247,0.08)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <IconCloud state={syncState} email={email} />
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 24, width: 320,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Cloud Sync</div>
                <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>Lexicon account</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: C.textMut, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
              >✕</button>
            </div>

            {email ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: C.accentLt, background: 'rgba(124,106,247,0.08)', borderRadius: 8, padding: '8px 12px' }}>
                  {email}
                </div>
                <div style={{ fontSize: 11, color: C.textMut }}>{formatLastSync(lastSync)}</div>
                {syncMsg && (
                  <div style={{ fontSize: 11, color: syncState === 'error' ? C.error : C.success }}>{syncMsg}</div>
                )}
                <button
                  onClick={runSync}
                  disabled={syncState === 'syncing'}
                  style={{
                    padding: '8px 0', borderRadius: 8, border: 'none',
                    background: syncState === 'syncing' ? 'rgba(124,106,247,0.3)' : C.accent,
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: syncState === 'syncing' ? 'wait' : 'pointer',
                  }}
                >
                  {syncState === 'syncing' ? 'Syncing…' : 'Sync Now'}
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    padding: '7px 0', borderRadius: 8, border: `1px solid ${C.border}`,
                    background: 'transparent', color: C.textMut, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, color: C.textMut, marginBottom: 4 }}>
                  Sign in with your Lexicon account to sync across devices.
                </div>
                <input
                  type="email"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${C.border}`, background: C.deepest,
                    color: C.text, fontSize: 12, outline: 'none',
                  }}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${C.border}`, background: C.deepest,
                    color: C.text, fontSize: 12, outline: 'none',
                  }}
                />
                {loginError && (
                  <div style={{ fontSize: 11, color: C.error }}>{loginError}</div>
                )}
                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    padding: '8px 0', borderRadius: 8, border: 'none',
                    background: loginLoading ? 'rgba(124,106,247,0.3)' : C.accent,
                    color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: loginLoading ? 'wait' : 'pointer', marginTop: 4,
                  }}
                >
                  {loginLoading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
