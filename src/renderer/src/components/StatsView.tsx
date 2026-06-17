import { useMemo } from 'react'
import type { DocMeta } from '../env'

const C = {
  base:     '#13111e',
  raised:   '#1a1825',
  overlay:  '#252235',
  border:   '#2a2740',
  accent:   '#7c6af7',
  accentLt: '#9d8ef9',
  textPri:  '#e8e5f5',
  textSec:  '#a09cc0',
  textMut:  '#55507a',
  green:    '#34d399',
  amber:    '#f59e0b',
}

const GOAL_WORDS = 80000
const TODAY_GOAL = 2000

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BAR_DATA = [820, 1430, 2100, 950, 1800, 3200, 1470]
const MAX_BAR = 3500

const CAL_DATA = [
  [1, 1, 0, 1, 1, 0, 0],
  [1, 1, 1, 1, 0, 1, 0],
  [0, 1, 1, 0, 1, 1, 1],
  [1, 1, 0, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 0],
]

function countWords(content: string | null | undefined): number {
  if (!content) return 0
  try {
    const parsed = JSON.parse(content)
    return extractWords(parsed)
  } catch {
    return content.split(/\s+/).filter(Boolean).length
  }
}

function extractWords(node: Record<string, unknown>): number {
  if (node.type === 'text') return String(node.text || '').split(/\s+/).filter(Boolean).length
  if (Array.isArray(node.content)) return (node.content as Record<string, unknown>[]).reduce((sum, n) => sum + extractWords(n), 0)
  return 0
}

function Card({ title, value, sub, accent, children }: {
  title: string; value?: string; sub?: string; accent?: string; children?: React.ReactNode
}) {
  return (
    <div style={{
      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{title}</div>
      {value !== undefined && <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? C.textPri, letterSpacing: '-0.02em' }}>{value}</div>}
      {sub !== undefined && <div style={{ fontSize: 11, color: C.textMut }}>{sub}</div>}
      {children}
    </div>
  )
}

type Props = { docs: DocMeta[] }

export default function StatsView({ docs }: Props) {
  const chapters = useMemo(() => docs.filter(d => d.type === 'chapter'), [docs])

  const totalWords = useMemo(() =>
    chapters.reduce((sum, d) => sum + countWords((d as DocMeta & { content?: string }).content), 0),
    [chapters]
  )

  const goalPct = Math.min((totalWords / GOAL_WORDS) * 100, 100).toFixed(1)

  const topChapterWords = useMemo(() => {
    const ws = chapters.map(d => countWords((d as DocMeta & { content?: string }).content))
    return Math.max(...ws, 1)
  }, [chapters])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.base }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.textPri, letterSpacing: '-0.02em', margin: 0 }}>Writing Stats</h1>
          <p style={{ fontSize: 12, color: C.textMut, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Top stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Card title="Total Words" value={totalWords.toLocaleString()} sub={`Goal: ${(GOAL_WORDS / 1000).toFixed(0)},000`} accent={C.accentLt}/>
          <Card title="Today" value="—" sub={`Goal: ${TODAY_GOAL.toLocaleString()}`} accent={C.amber}/>
          <Card title="Streak" value="—" sub="Keep writing daily" accent={C.green}/>
          <Card title="Avg / Day" value="—" sub="This month"/>
        </div>

        {/* Novel progress */}
        <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>Novel Progress</span>
            <span style={{ fontSize: 11, color: C.textMut }}>{totalWords.toLocaleString()} / {(GOAL_WORDS / 1000).toFixed(0)},000 words · {goalPct}%</span>
          </div>
          <div style={{ height: 8, background: C.overlay, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${goalPct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.accentLt})`, borderRadius: 4, transition: 'width 0.4s' }}/>
          </div>
          {chapters.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {chapters.slice(0, 4).map(ch => {
                const words = countWords((ch as DocMeta & { content?: string }).content)
                const pct = Math.round((words / Math.max(totalWords, 1)) * 100)
                return (
                  <div key={ch.id} style={{ flex: 1, minWidth: 80 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: C.textMut, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{ch.title}</span>
                      <span style={{ fontSize: 10, color: C.textMut, marginLeft: 4 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: C.overlay, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: C.accent, borderRadius: 2 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bar chart + Streak calendar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Card title="Words per Day — This Week">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 8 }}>
              {BAR_DATA.map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%',
                    background: i === 6 ? C.accent : C.accentDm,
                    borderRadius: '3px 3px 0 0',
                    height: `${(v / MAX_BAR) * 80}px`,
                    opacity: i === 6 ? 1 : 0.6,
                  } as React.CSSProperties}/>
                  <span style={{ fontSize: 9, color: C.textMut }}>{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Writing Streak — 5 Weeks">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {CAL_DATA.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', gap: 4 }}>
                  {week.map((active, di) => (
                    <div key={di} style={{
                      width: 18, height: 18, borderRadius: 4,
                      background: active
                        ? (wi === 4 && di <= 5 ? C.accent : `${C.accent}60`)
                        : C.overlay,
                    }}/>
                  ))}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                {DAYS.map(d => <span key={d} style={{ width: 18, fontSize: 9, color: C.textMut, textAlign: 'center' }}>{d[0]}</span>)}
              </div>
            </div>
          </Card>
        </div>

        {/* Chapter breakdown */}
        {chapters.length > 0 && (
          <Card title="Chapter Breakdown">
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chapters.map(ch => {
                const words = countWords((ch as DocMeta & { content?: string }).content)
                const pct = (words / topChapterWords) * 100
                return (
                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.textSec, width: 160, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.title}
                    </span>
                    <div style={{ flex: 1, height: 4, background: C.overlay, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: C.accent, borderRadius: 2 }}/>
                    </div>
                    <span style={{ fontSize: 11, color: C.textMut, width: 40, textAlign: 'right' }}>
                      {words > 999 ? `${(words / 1000).toFixed(1)}k` : words}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {chapters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMut, fontSize: 13 }}>
            Start writing chapters to see your stats here.
          </div>
        )}
      </div>
    </div>
  )
}
