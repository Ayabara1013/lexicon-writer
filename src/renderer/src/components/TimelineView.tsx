import { useMemo } from 'react'
import type { DocMeta } from '../env'

const C = {
  base:     '#13111e',
  raised:   '#1a1825',
  overlay:  '#252235',
  border:   '#2a2740',
  accent:   '#7c6af7',
  accentLt: '#9d8ef9',
  accentBg: 'rgba(124,106,247,0.10)',
  accentDm: '#3d357a',
  textPri:  '#e8e5f5',
  textSec:  '#a09cc0',
  textMut:  '#55507a',
  green:    '#34d399',
  amber:    '#f59e0b',
  red:      '#f87171',
}

const ARC_COLORS = ['#7c6af7', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#f472b6']

type Props = { docs: DocMeta[] }

export default function TimelineView({ docs }: Props) {
  const chapters = useMemo(() => docs.filter(d => d.type === 'chapter'), [docs])

  // Derive arcs from chapters (group every ~3 chapters into an arc)
  const arcs = useMemo(() => {
    if (chapters.length === 0) return DEFAULT_ARCS
    const groupSize = Math.max(1, Math.ceil(chapters.length / 4))
    const groups: { label: string; color: string; start: number; end: number; chapters: DocMeta[] }[] = []
    for (let i = 0; i < chapters.length; i += groupSize) {
      const group = chapters.slice(i, i + groupSize)
      const startPct = Math.round((i / chapters.length) * 100)
      const endPct = Math.round(Math.min(((i + groupSize) / chapters.length) * 100, 100))
      groups.push({
        label: `Arc ${groups.length + 1}`,
        color: ARC_COLORS[groups.length % ARC_COLORS.length],
        start: startPct,
        end: endPct,
        chapters: group,
      })
    }
    return groups
  }, [chapters])

  const scenes = useMemo(() => {
    if (chapters.length === 0) return DEFAULT_SCENES
    return chapters.map((ch, i) => {
      const pct = chapters.length > 1 ? Math.round((i / (chapters.length - 1)) * 100) : 50
      const arcIdx = Math.floor(i / Math.max(1, Math.ceil(chapters.length / 4)))
      return {
        id: ch.id,
        title: ch.title,
        pos: pct,
        color: ARC_COLORS[arcIdx % ARC_COLORS.length],
        arcLabel: `Arc ${arcIdx + 1}`,
        status: i === chapters.length - 1 ? 'active' : (i < chapters.length - 1 ? 'done' : 'empty'),
      }
    })
  }, [chapters])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.base }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
        borderBottom: `1px solid ${C.border}`, background: C.raised, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>Plot Timeline</span>
        <div style={{ flex: 1 }}/>
        <button style={{ fontSize: 11, color: C.textMut, background: C.overlay, border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>Group by Arc</button>
        <button style={{ fontSize: 11, color: C.accentLt, background: C.accentBg, border: `1px solid ${C.accentDm}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>+ Scene</button>
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: '32px 40px', background: C.base }}>
        <div style={{ minWidth: 900 }}>
          {/* Timeline ruler */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, paddingLeft: 120 }}>
            {Array.from({ length: 11 }, (_, i) => i * 10).map(pct => (
              <div key={pct} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: C.textMut }}>
                {pct > 0 ? `${pct}%` : ''}
              </div>
            ))}
          </div>
          <div style={{ paddingLeft: 120, position: 'relative', marginBottom: 20 }}>
            <div style={{ height: 1, background: C.border, position: 'relative' }}>
              {Array.from({ length: 11 }, (_, i) => i * 10).map(pct => (
                <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: -3, width: 1, height: 7, background: C.border }}/>
              ))}
            </div>
          </div>

          {/* Arc rows */}
          {arcs.map((arc) => (
            <div key={arc.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
              <div style={{ width: 120, flexShrink: 0, fontSize: 11, color: arc.color, fontWeight: 600, paddingRight: 12 }}>{arc.label}</div>
              <div style={{ flex: 1, position: 'relative', height: 36 }}>
                {/* Arc bar */}
                <div style={{
                  position: 'absolute',
                  left: `${arc.start}%`, width: `${arc.end - arc.start}%`,
                  top: 14, height: 8, borderRadius: 4,
                  background: `${arc.color}28`, border: `1px solid ${arc.color}50`,
                }}/>
                {/* Scene markers */}
                {scenes.filter(s => s.arcLabel === arc.label).map(sc => (
                  <div key={sc.id} style={{
                    position: 'absolute', left: `${sc.pos}%`, top: 0,
                    transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      fontSize: 10, color: C.textPri, background: C.raised,
                      border: `1.5px solid ${sc.color}`,
                      borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap',
                      boxShadow: sc.status === 'active' ? `0 0 10px ${sc.color}50` : 'none',
                      fontWeight: sc.status === 'active' ? 600 : 400,
                      opacity: sc.status === 'empty' ? 0.5 : 1,
                    }}>{sc.title}</div>
                    <div style={{ width: 1, height: 6, background: sc.color, opacity: 0.5 }}/>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: sc.status === 'active' ? sc.color : `${sc.color}60`,
                      border: `1.5px solid ${sc.color}`,
                    }}/>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Scene cards */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 120 }}>Scene Cards</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingLeft: 120 }}>
              {scenes.map((sc, i) => (
                <div key={sc.id} style={{
                  background: C.raised,
                  border: `1.5px solid ${sc.status === 'active' ? sc.color : C.border}`,
                  borderTop: `3px solid ${sc.color}`,
                  borderRadius: 7, padding: '10px 12px', width: 160,
                  opacity: sc.status === 'empty' ? 0.5 : 1,
                  boxShadow: sc.status === 'active' ? `0 4px 16px ${sc.color}30` : 'none',
                }}>
                  <div style={{ fontSize: 10, color: sc.color, marginBottom: 3 }}>Ch {i + 1}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textPri, marginBottom: 6, lineHeight: 1.3 }}>{sc.title}</div>
                  <div style={{ fontSize: 10, color: C.textMut }}>
                    {sc.status === 'empty' ? 'Not started' : sc.status === 'active' ? 'In progress' : 'Complete'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {chapters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0 20px', color: C.textMut, fontSize: 13 }}>
              Add chapters in the sidebar to see your story timeline here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fallback data shown before any chapters exist ─────────────────────────────
const DEFAULT_ARCS = [
  { label: 'Act I', color: '#7c6af7', start: 0, end: 30, chapters: [] as DocMeta[] },
  { label: 'Act II', color: '#34d399', start: 25, end: 75, chapters: [] as DocMeta[] },
  { label: 'Act III', color: '#f59e0b', start: 70, end: 100, chapters: [] as DocMeta[] },
]

const DEFAULT_SCENES = [
  { id: 's1', title: 'Inciting Incident', pos: 10, color: '#7c6af7', arcLabel: 'Act I', status: 'empty' },
  { id: 's2', title: 'First Plot Point', pos: 28, color: '#7c6af7', arcLabel: 'Act I', status: 'empty' },
  { id: 's3', title: 'Midpoint', pos: 50, color: '#34d399', arcLabel: 'Act II', status: 'empty' },
  { id: 's4', title: 'Climax', pos: 85, color: '#f59e0b', arcLabel: 'Act III', status: 'empty' },
  { id: 's5', title: 'Resolution', pos: 97, color: '#f59e0b', arcLabel: 'Act III', status: 'empty' },
]
