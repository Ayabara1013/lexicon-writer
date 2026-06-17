import { useState, useEffect, useRef } from 'react'
import type { DocMeta } from '../env'

const SCENE_STATUSES = ['draft', 'revised', 'final', 'cut'] as const
const STATUS_COLORS: Record<string, string> = {
  draft:   '#6b7280',
  revised: '#f59e0b',
  final:   '#22c55e',
  cut:     '#ef4444',
}

const C = {
  bg:      '#13111e',
  raised:  '#1a1825',
  border:  '#2a2740',
  overlay: '#252235',
  accent:  '#7c6af7',
  textPri: '#e8e5f5',
  textSec: '#a09cc0',
  textMut: '#55507a',
}

type Props = {
  doc: DocMeta
  wordCount: number
  onUpdate: (fields: Partial<Pick<DocMeta, 'word_target' | 'pov' | 'location' | 'scene_status'>>) => void
}

export default function SceneMetaBar({ doc, wordCount, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [pov, setPov] = useState(doc.pov ?? '')
  const [location, setLocation] = useState(doc.location ?? '')
  const [targetStr, setTargetStr] = useState(doc.word_target?.toString() ?? '')

  useEffect(() => {
    setPov(doc.pov ?? '')
    setLocation(doc.location ?? '')
    setTargetStr(doc.word_target?.toString() ?? '')
  }, [doc.id])

  const target = doc.word_target
  const progress = target ? Math.min(1, wordCount / target) : null

  const inputStyle: React.CSSProperties = {
    background: C.overlay, border: `1px solid ${C.border}`,
    borderRadius: 5, color: C.textPri, fontSize: 11,
    padding: '3px 7px', outline: 'none', width: '100%',
  }

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.raised }}>
      {/* Collapsed bar — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11 }}>
        {/* Word count + progress */}
        <span style={{ color: C.textMut }}>{wordCount.toLocaleString()} words</span>
        {target && (
          <>
            <span style={{ color: C.textMut }}>/ {target.toLocaleString()} target</span>
            <div style={{ flex: 1, maxWidth: 100, height: 3, background: C.border, borderRadius: 2 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${progress! * 100}%`,
                background: progress! >= 1 ? '#22c55e' : C.accent,
                transition: 'width 0.3s',
              }}/>
            </div>
            <span style={{ color: progress! >= 1 ? '#22c55e' : C.textMut }}>
              {progress! >= 1 ? '✓ Done' : `${Math.round(progress! * 100)}%`}
            </span>
          </>
        )}

        {/* Quick pills */}
        {doc.scene_status && (
          <span style={{
            padding: '1px 7px', borderRadius: 10, fontSize: 10,
            background: `${STATUS_COLORS[doc.scene_status] ?? C.textMut}22`,
            color: STATUS_COLORS[doc.scene_status] ?? C.textMut,
            border: `1px solid ${STATUS_COLORS[doc.scene_status] ?? C.textMut}44`,
          }}>{doc.scene_status}</span>
        )}
        {doc.pov && <span style={{ color: C.textMut }}>POV: <span style={{ color: C.textSec }}>{doc.pov}</span></span>}
        {doc.location && <span style={{ color: C.textMut }}>@ <span style={{ color: C.textSec }}>{doc.location}</span></span>}

        <div style={{ flex: 1 }}/>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMut, fontSize: 11, padding: '2px 4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.textSec)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textMut)}
        >{open ? '▲ Scene info' : '▼ Scene info'}</button>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 8, padding: '8px 12px 10px',
          borderTop: `1px solid ${C.border}`,
        }}>
          {/* POV */}
          <div>
            <label style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>POV</label>
            <input
              style={inputStyle}
              placeholder="Character name…"
              value={pov}
              onChange={(e) => setPov(e.target.value)}
              onBlur={() => onUpdate({ pov: pov.trim() || null })}
              onKeyDown={(e) => { if (e.key === 'Enter') onUpdate({ pov: pov.trim() || null }) }}
            />
          </div>

          {/* Location */}
          <div>
            <label style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Location</label>
            <input
              style={inputStyle}
              placeholder="Scene location…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onBlur={() => onUpdate({ location: location.trim() || null })}
              onKeyDown={(e) => { if (e.key === 'Enter') onUpdate({ location: location.trim() || null }) }}
            />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Status</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {SCENE_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdate({ scene_status: doc.scene_status === s ? null : s })}
                  style={{
                    flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 10, cursor: 'pointer',
                    border: `1px solid ${doc.scene_status === s ? STATUS_COLORS[s] : C.border}`,
                    background: doc.scene_status === s ? `${STATUS_COLORS[s]}22` : C.overlay,
                    color: doc.scene_status === s ? STATUS_COLORS[s] : C.textMut,
                  }}
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Word target */}
          <div>
            <label style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Word target</label>
            <input
              style={inputStyle}
              placeholder="e.g. 2000"
              type="number"
              min={0}
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              onBlur={() => {
                const n = parseInt(targetStr)
                onUpdate({ word_target: isNaN(n) || n <= 0 ? null : n })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt(targetStr)
                  onUpdate({ word_target: isNaN(n) || n <= 0 ? null : n })
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
