import { useState } from 'react'
import { supabase } from '../supabase'

type Props = { onLogin: (email: string) => void }

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    if (data.user) onLogin(data.user.email ?? email)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#13111e',
    }}>
      <div style={{
        width: 360, padding: 40,
        background: '#1a1825', borderRadius: 16,
        border: '1px solid #2a2740',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #7c6af7, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path d="M2 12l2.5-6L11 2l2 2-6.5 6.5L2 12z" fill="white" opacity="0.9"/>
              <circle cx="11.5" cy="2.5" r="1" fill="white"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e5f5' }}>Lexicon Writer</div>
            <div style={{ fontSize: 11, color: '#55507a' }}>Sign in to access your work</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid #2a2740', background: '#0d0b18',
              color: '#e8e5f5', fontSize: 13, outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#7c6af7' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2740' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid #2a2740', background: '#0d0b18',
              color: '#e8e5f5', fontSize: 13, outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#7c6af7' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2740' }}
          />

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, padding: '10px 0', borderRadius: 8, border: 'none',
              background: loading ? 'rgba(124,106,247,0.4)' : '#7c6af7',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 11, color: '#55507a', textAlign: 'center', lineHeight: 1.5 }}>
          Use your Lexicon account credentials.
        </p>
      </div>
    </div>
  )
}
