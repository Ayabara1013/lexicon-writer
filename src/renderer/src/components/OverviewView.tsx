import { useState, useMemo, useRef, useCallback } from 'react'
import type { DocMeta } from '../env'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  base:     '#13111e',
  raised:   '#1a1825',
  overlay:  '#252235',
  border:   '#2a2740',
  accent:   '#7c6af7',
  accentLt: '#9d8ef9',
  accentDm: '#3d357a',
  accentBg: 'rgba(124,106,247,0.10)',
  textPri:  '#e8e5f5',
  textSec:  '#a09cc0',
  textMut:  '#55507a',
  green:    '#34d399',
  amber:    '#f59e0b',
}

// Palette for chapter highlight colors (assigned by index)
const PALETTERGB: [number, number, number][] = [
  [245, 158,  11],
  [124, 106, 247],
  [ 52, 211, 153],
  [248, 113, 113],
  [ 56, 189, 248],
  [244, 114, 182],
  [167, 139, 250],
  [ 96, 165, 250],
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface Segment {
  text: string
  chaps: string[] // doc IDs
}

interface Block {
  id: string
  segments: Segment[]
}

interface ChapMeta {
  id: string
  title: string
  color: [number, number, number]
  scenes: number
}

type Props = {
  docs: DocMeta[]
  onOpenDoc: (id: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rgb(color: [number, number, number], alpha = 1) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
}

function blendColors(c1: [number, number, number], c2: [number, number, number]): [number, number, number] {
  return [
    Math.round((c1[0] + c2[0]) / 2),
    Math.round((c1[1] + c2[1]) / 2),
    Math.round((c1[2] + c2[2]) / 2),
  ]
}

function segBg(chaps: string[], chapMap: Map<string, ChapMeta>, hovered: boolean) {
  if (!chaps.length) return 'transparent'
  const alpha = hovered ? 0.32 : (chaps.length > 1 ? 0.28 : 0.19)
  const c1 = chapMap.get(chaps[0])
  if (!c1) return 'transparent'
  if (chaps.length === 1) return rgb(c1.color, alpha)
  const c2 = chapMap.get(chaps[1])
  if (!c2) return rgb(c1.color, alpha)
  return rgb(blendColors(c1.color, c2.color), alpha * 1.5)
}

function getChapOrder(blocks: Block[]) {
  const seen: string[] = []
  blocks.forEach(block => {
    block.segments.forEach(seg => {
      seg.chaps.forEach(id => { if (!seen.includes(id)) seen.push(id) })
    })
  })
  return seen
}

function getChapCharPositions(blocks: Block[]) {
  let cursor = 0
  const starts: Record<string, number> = {}
  const ends: Record<string, number> = {}
  blocks.forEach(block => {
    block.segments.forEach(seg => {
      const len = seg.text.length
      seg.chaps.forEach(id => {
        if (starts[id] === undefined) starts[id] = cursor
        ends[id] = cursor + len
      })
      cursor += len
    })
  })
  return { totalChars: cursor, starts, ends }
}

function segLineColor(chaps: string[], chapMap: Map<string, ChapMeta>) {
  if (!chaps.length) return C.border
  const c1 = chapMap.get(chaps[0])
  if (!c1) return C.border
  if (chaps.length === 1) return rgb(c1.color, 0.55)
  const c2 = chapMap.get(chaps[1])
  if (!c2) return rgb(c1.color, 0.55)
  return rgb(blendColors(c1.color, c2.color), 0.65)
}

function getLineSegments(totalChars: number, starts: Record<string, number>, ends: Record<string, number>, chapOrder: string[]) {
  if (!totalChars) return [] as { from: number; to: number; chaps: string[] }[]
  const events: { pos: number; type: 'start' | 'end'; chapId: string }[] = []
  chapOrder.forEach(id => {
    if (starts[id] !== undefined) {
      events.push({ pos: starts[id], type: 'start', chapId: id })
      events.push({ pos: ends[id], type: 'end', chapId: id })
    }
  })
  events.sort((a, b) => a.pos - b.pos || (a.type === 'end' ? -1 : 1))
  const segments: { from: number; to: number; chaps: string[] }[] = []
  let cursor = 0
  const active = new Set<string>()
  events.forEach(ev => {
    if (ev.pos > cursor) {
      segments.push({ from: cursor / totalChars, to: ev.pos / totalChars, chaps: [...active] })
    }
    if (ev.type === 'start') active.add(ev.chapId)
    else active.delete(ev.chapId)
    cursor = ev.pos
  })
  if (cursor < totalChars) {
    segments.push({ from: cursor / totalChars, to: 1, chaps: [...active] })
  }
  return segments
}

// ── Default initial blocks (writable overview for a new project) ───────────────
function makeInitialBlocks(chapters: DocMeta[]): Block[] {
  if (chapters.length === 0) {
    return [{ id: 'b0', segments: [{ text: 'Begin your story overview here. Highlight words to nest chapters inside them.', chaps: [] }] }]
  }
  return [
    { id: 'b0', segments: [{ text: 'Your story overview. Select text below to link it to a chapter — highlighted passages show chapter coverage.', chaps: [] }] },
    ...chapters.slice(0, 4).map((ch, i) => ({
      id: `b${i + 1}`,
      segments: [{ text: ch.title + ' — click to open this chapter in the editor.', chaps: [ch.id] }],
    })),
  ]
}

const STORAGE_KEY = 'lx-overview-blocks-v1'

function loadBlocks(chapters: DocMeta[]): Block[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Block[]
  } catch { /* ignore */ }
  return makeInitialBlocks(chapters)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="3"  r="1.2"/><circle cx="7" cy="3"  r="1.2"/>
      <circle cx="3" cy="7"  r="1.2"/><circle cx="7" cy="7"  r="1.2"/>
      <circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/>
    </svg>
  )
}

function SceneBadge({ chap, position }: { chap: ChapMeta; position: number }) {
  const [r, g, b] = chap.color
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: `rgba(${r},${g},${b},0.18)`,
      border: `1px solid rgba(${r},${g},${b},0.38)`,
      borderRadius: 4, padding: '1px 5px',
      fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
      color: `rgba(${r},${g},${b},0.95)`,
      letterSpacing: '0.04em', userSelect: 'none',
      lineHeight: '14px', whiteSpace: 'nowrap',
      pointerEvents: 'none', verticalAlign: 'middle', marginLeft: 4,
    }}>
      #{position}
      {chap.scenes > 0 && (
        <span style={{ color: `rgba(${r},${g},${b},0.65)`, fontWeight: 400, fontSize: 8.5 }}>
          · {chap.scenes}✦
        </span>
      )}
    </span>
  )
}

function TimelineStrip({
  blocks, chapOrder, chapMap, hoveredChapId, onHover,
}: {
  blocks: Block[]
  chapOrder: string[]
  chapMap: Map<string, ChapMeta>
  hoveredChapId: string | null
  onHover: (id: string | null) => void
}) {
  const { totalChars, starts, ends } = useMemo(() => getChapCharPositions(blocks), [blocks])
  const lineSegs = useMemo(() => getLineSegments(totalChars, starts, ends, chapOrder), [totalChars, starts, ends, chapOrder])

  const PAD_TOP = 64, PAD_BOT = 52
  const LINE_LEFT = '58%'

  function pctToTop(frac: number) {
    return `calc(${PAD_TOP}px + ${frac} * (100% - ${PAD_TOP + PAD_BOT}px))`
  }
  function pctToHeight(from: number, to: number) {
    return `calc(${to - from} * (100% - ${PAD_TOP + PAD_BOT}px))`
  }

  return (
    <div style={{ width: 48, flexShrink: 0, background: 'transparent', position: 'relative' }}>
      <div style={{ position: 'absolute', top: PAD_TOP, left: 0, right: 0, height: 24, background: `linear-gradient(to bottom, ${C.base}, transparent)`, zIndex: 4, pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', bottom: PAD_BOT, left: 0, right: 0, height: 24, background: `linear-gradient(to top, ${C.base}, transparent)`, zIndex: 4, pointerEvents: 'none' }}/>

      {lineSegs.map((seg, i) => {
        const color = segLineColor(seg.chaps, chapMap)
        const hasChap = seg.chaps.length > 0
        return (
          <div key={i} style={{
            position: 'absolute',
            top: pctToTop(seg.from),
            height: pctToHeight(seg.from, seg.to),
            minHeight: 1,
            left: LINE_LEFT, transform: 'translateX(-50%)',
            width: hasChap ? 3 : 2,
            background: color,
            borderRadius: 999,
            boxShadow: hasChap ? `0 0 3px 0px ${color}` : 'none',
            zIndex: 1,
          }}/>
        )
      })}

      {chapOrder.map((chapId, i) => {
        const ch = chapMap.get(chapId)
        if (!ch) return null
        const [r, g, b] = ch.color
        const startPct = (starts[chapId] || 0) / Math.max(totalChars, 1)
        const endPct = (ends[chapId] || 0) / Math.max(totalChars, 1)
        const midPct = (startPct + endPct) / 2
        const isHovered = hoveredChapId === chapId
        const sz = isHovered ? 22 : 18
        const pos = i + 1

        return (
          <div
            key={chapId}
            title={ch.title}
            onMouseEnter={() => onHover(chapId)}
            onMouseLeave={() => onHover(null)}
            style={{
              position: 'absolute',
              top: pctToTop(midPct),
              left: LINE_LEFT,
              transform: 'translate(-50%, -50%)',
              zIndex: 5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{
              position: 'absolute',
              width: isHovered ? 36 : 26, height: isHovered ? 36 : 26,
              borderRadius: '50%',
              background: `rgba(${r},${g},${b},${isHovered ? 0.18 : 0.08})`,
              filter: `blur(${isHovered ? 4 : 3}px)`,
              transition: 'width 0.15s, height 0.15s',
            }}/>
            <div style={{
              position: 'absolute',
              width: sz + 6, height: sz + 6, borderRadius: '50%',
              background: C.base,
            }}/>
            <div style={{
              width: sz, height: sz, borderRadius: '50%',
              background: `rgba(${r},${g},${b},${isHovered ? 0.4 : 0.25})`,
              border: `2px solid rgba(${r},${g},${b},${isHovered ? 1 : 0.78})`,
              boxShadow: isHovered
                ? `0 0 16px 2px rgba(${r},${g},${b},0.55), 0 0 6px rgba(${r},${g},${b},0.4)`
                : `0 0 8px rgba(${r},${g},${b},0.35)`,
              transition: 'width 0.15s, height 0.15s, border-color 0.15s',
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                color: `rgba(${r},${g},${b},${isHovered ? 1 : 0.85})`,
                letterSpacing: '-0.02em', lineHeight: 1, userSelect: 'none',
              }}>#{pos}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverviewSidebar({
  chapOrder, chapMap, hoveredChapId, onHover, onSelect,
}: {
  chapOrder: string[]
  chapMap: Map<string, ChapMeta>
  hoveredChapId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const orderedChaps = chapOrder.map(id => chapMap.get(id)).filter(Boolean) as ChapMeta[]

  return (
    <div style={{
      width: 192, flexShrink: 0,
      background: C.raised, borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '13px 14px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Overview</div>
        <div style={{ fontSize: 12, color: C.textSec, fontWeight: 500 }}>Story structure</div>
      </div>
      <div style={{ padding: '9px 14px 4px' }}>
        <div style={{ fontSize: 10, color: C.textMut, letterSpacing: '0.04em' }}>Chapters · narrative order</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '3px 8px' }}>
        {orderedChaps.map((ch, i) => {
          const [r, g, b] = ch.color
          const isHovered = hoveredChapId === ch.id
          return (
            <div
              key={ch.id}
              onMouseEnter={() => onHover(ch.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(ch.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 7px', borderRadius: 7, cursor: 'pointer',
                background: isHovered ? `rgba(${r},${g},${b},0.11)` : 'transparent',
                transition: 'background 0.12s', marginBottom: 1,
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: `rgba(${r},${g},${b},0.7)`, minWidth: 14, textAlign: 'right', flexShrink: 0 }}>
                #{i + 1}
              </span>
              <div style={{
                width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                background: `rgba(${r},${g},${b},0.8)`,
                boxShadow: isHovered ? `0 0 7px rgba(${r},${g},${b},0.55)` : 'none',
                transition: 'box-shadow 0.15s',
              }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  color: isHovered ? C.textPri : C.textSec,
                  fontWeight: isHovered ? 500 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  transition: 'color 0.12s',
                }}>{ch.title}</div>
              </div>
              {ch.scenes > 0 && (
                <span style={{ fontSize: 9.5, color: C.textMut, flexShrink: 0, fontFamily: 'monospace' }}>
                  {ch.scenes}✦
                </span>
              )}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 7, cursor: 'pointer', marginTop: 4, color: C.textMut }}>
          <span style={{ minWidth: 14 }}/>
          <div style={{ width: 9, height: 9, borderRadius: 3, border: `1px dashed ${C.textMut}`, flexShrink: 0 }}/>
          <span style={{ fontSize: 11 }}>Add chapter…</span>
        </div>
      </div>
      {/* Legend */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textMut, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 28, height: 9, borderRadius: 2, background: 'rgba(245,158,11,0.2)', boxShadow: 'inset 0 -2px 0 rgba(245,158,11,0.5)' }}/>
            <span style={{ fontSize: 10, color: C.textMut }}>Single chapter</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 28, height: 9, borderRadius: 2, background: 'rgba(186,148,129,0.34)', outline: '1px dashed rgba(186,148,129,0.4)', outlineOffset: 1 }}/>
            <span style={{ fontSize: 10, color: C.textMut }}>Overlapping</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectionPopup({ top, left, chapMap, onClose }: {
  top: number; left: number
  chapMap: Map<string, ChapMeta>
  onClose: () => void
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top, left,
        background: C.overlay, border: `1px solid ${C.border}`,
        borderRadius: 9, padding: '5px 4px',
        boxShadow: '0 12px 40px #000b',
        zIndex: 100, minWidth: 204,
      }}
    >
      <div style={{ padding: '3px 10px 7px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textMut }}>Nest into chapter</div>
      </div>
      <div style={{ padding: '4px 0' }}>
        {Array.from(chapMap.values()).map(ch => {
          const [r, g, b] = ch.color
          return (
            <div key={ch.id} onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: `rgb(${r},${g},${b})`, flexShrink: 0 }}/>
              <span style={{ fontSize: 11, color: C.textSec }}>{ch.title}</span>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '5px 10px 3px' }}>
        <div onClick={onClose} style={{ fontSize: 11, color: C.accentLt, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          <span>New chapter from this passage</span>
        </div>
      </div>
    </div>
  )
}

function ChapterZoomView({ chapId, sourceText, chapMap, onBack, onOpenDoc }: {
  chapId: string; sourceText: string
  chapMap: Map<string, ChapMeta>
  onBack: () => void
  onOpenDoc: (id: string) => void
}) {
  const chap = chapMap.get(chapId)
  if (!chap) return null
  const [r, g, b] = chap.color

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.base }}>
      <div style={{
        height: 40, flexShrink: 0, borderBottom: `1px solid ${C.border}`,
        background: C.raised, display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          color: C.textMut, fontSize: 11, padding: '4px 8px', borderRadius: 6,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Overview
        </button>
        <span style={{ color: C.textMut, fontSize: 13 }}>›</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: `rgb(${r},${g},${b})`, flexShrink: 0 }}/>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textPri }}>{chap.title}</span>
        </div>
        <div style={{ flex: 1 }}/>
        <button onClick={() => onOpenDoc(chapId)} style={{
          height: 24, padding: '0 10px', border: `1px solid ${C.accentDm}`,
          borderRadius: 5, background: C.accentBg, color: C.accentLt,
          fontSize: 11, cursor: 'pointer',
        }}>Open in editor →</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '52px 60px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{
            borderLeft: `3px solid rgba(${r},${g},${b},0.55)`,
            padding: '10px 16px',
            background: `rgba(${r},${g},${b},0.07)`,
            borderRadius: '0 7px 7px 0',
            marginBottom: 44,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(${r},${g},${b},0.8)`, marginBottom: 5 }}>From overview</div>
            <div style={{ fontSize: 13, color: C.textSec, fontFamily: "'Georgia', serif", fontStyle: 'italic', lineHeight: 1.65 }}>"{sourceText}"</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: `rgba(${r},${g},${b},0.9)`, marginBottom: 10 }}>{chap.title}</div>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: C.textMut, fontFamily: "'Georgia', serif", fontStyle: 'italic' }}>
            Begin writing this chapter…
            <span style={{ display: 'inline-block', width: 2, height: 16, background: `rgba(${r},${g},${b},0.8)`, marginLeft: 2, verticalAlign: 'middle' }}/>
          </p>
          <div style={{ marginTop: 32 }}>
            <button onClick={() => onOpenDoc(chapId)} style={{
              padding: '8px 18px', borderRadius: 7,
              border: `1px solid rgba(${r},${g},${b},0.35)`,
              background: `rgba(${r},${g},${b},0.1)`,
              color: `rgba(${r},${g},${b},1)`,
              fontSize: 12, cursor: 'pointer',
            }}>
              Open chapter in editor →
            </button>
          </div>
        </div>
      </div>

      <div style={{
        height: 26, flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.raised,
        display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 16,
      }}>
        <span style={{ fontSize: 11, color: C.textMut }}>{chap.title}</span>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: C.textMut }}>Autosaved</span>
      </div>
    </div>
  )
}

interface OverviewBlockProps {
  block: Block
  chapOrder: string[]
  chapMap: Map<string, ChapMeta>
  hoveredChapId: string | null
  onHover: (id: string | null) => void
  onOpenChap: (id: string, text: string) => void
  isDragging: boolean
  isDragOver: boolean
  dragOverPos: 'before' | 'after'
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}

function OverviewBlock({
  block, chapOrder, chapMap, hoveredChapId, onHover, onOpenChap,
  isDragging, isDragOver, dragOverPos,
  onDragStart, onDragOver: handleDragOver, onDragEnd, onDrop,
}: OverviewBlockProps) {
  const [blockHovered, setBlockHovered] = useState(false)
  const seenChaps = useRef<Set<string>>(new Set())
  seenChaps.current = new Set()

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onMouseEnter={() => setBlockHovered(true)}
      onMouseLeave={() => setBlockHovered(false)}
      style={{ position: 'relative', opacity: isDragging ? 0.35 : 1, transition: 'opacity 0.15s', paddingLeft: 28 }}
    >
      {isDragOver && dragOverPos === 'before' && (
        <div style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 2, background: C.accent, borderRadius: 1, boxShadow: `0 0 6px ${C.accent}` }}/>
      )}
      <div style={{
        position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
        color: C.textMut, opacity: blockHovered ? 0.7 : 0,
        transition: 'opacity 0.12s', cursor: 'grab', userSelect: 'none',
        display: 'flex', alignItems: 'center',
      }}>
        <DragHandle />
      </div>
      <span style={{ lineHeight: 1.95, fontSize: 16, fontFamily: "'Georgia', serif", color: C.textSec }}>
        {block.segments.map((seg, si) => {
          if (seg.chaps.length === 0) return <span key={si}>{seg.text}</span>

          const isOverlap = seg.chaps.length > 1
          const isHovered = seg.chaps.includes(hoveredChapId ?? '')
          const bg = segBg(seg.chaps, chapMap, isHovered)
          const primaryId = seg.chaps[0]
          const primaryChap = chapMap.get(primaryId)
          if (!primaryChap) return <span key={si}>{seg.text}</span>

          const ul1 = rgb(primaryChap.color, 0.5)
          const secondChap = isOverlap ? chapMap.get(seg.chaps[1]) : null
          const ul2 = secondChap ? rgb(secondChap.color, 0.45) : null
          const boxShadow = ul2 ? `inset 0 -2px 0 ${ul1}, inset 0 -4px 0 ${ul2}` : `inset 0 -2px 0 ${ul1}`

          const showBadge = !seenChaps.current.has(primaryId)
          if (showBadge) seenChaps.current.add(primaryId)
          const chapPos = chapOrder.indexOf(primaryId) + 1

          return (
            <span
              key={si}
              onMouseEnter={() => onHover(primaryId)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => { e.stopPropagation(); onOpenChap(primaryId, seg.text.trim()) }}
              title={seg.chaps.map(id => chapMap.get(id)?.title ?? id).join(' + ')}
              style={{
                background: bg, borderRadius: 3, cursor: 'pointer',
                boxShadow, transition: 'background 0.13s',
                outline: isOverlap ? `1px dashed ${rgb(primaryChap.color, 0.28)}` : 'none',
                outlineOffset: 2, padding: '1px 0',
              }}
            >
              {seg.text}{showBadge && <SceneBadge chap={primaryChap} position={chapPos} />}
            </span>
          )
        })}
      </span>
      {isDragOver && dragOverPos === 'after' && (
        <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 2, background: C.accent, borderRadius: 1, boxShadow: `0 0 6px ${C.accent}` }}/>
      )}
    </div>
  )
}

function OverviewTextBody({
  blocks, setBlocks, chapOrder, chapMap, hoveredChapId, onHover, onOpenChap, onShowPopup,
}: {
  blocks: Block[]
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>
  chapOrder: string[]
  chapMap: Map<string, ChapMeta>
  hoveredChapId: string | null
  onHover: (id: string | null) => void
  onOpenChap: (id: string, text: string) => void
  onShowPopup: (p: { visible: boolean; top?: number; left?: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('after')

  function handleMouseUp() {
    const sel = window.getSelection()
    if (sel && sel.toString().trim().length > 8) {
      try {
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const cRect = containerRef.current!.getBoundingClientRect()
        onShowPopup({ visible: true, top: rect.top - cRect.top - 88, left: rect.left - cRect.left + rect.width / 2 - 100 })
      } catch { /* ignore */ }
    } else {
      onShowPopup({ visible: false })
    }
  }

  function handleDragStart(blockId: string) { setDragId(blockId) }

  function handleDragOver(e: React.DragEvent, blockId: string) {
    e.preventDefault()
    setDragOverId(blockId)
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    setBlocks(prev => {
      const arr = [...prev]
      const fromIdx = arr.findIndex(b => b.id === dragId)
      const toIdx = arr.findIndex(b => b.id === targetId)
      const [moved] = arr.splice(fromIdx, 1)
      const insertAt = dragOverPos === 'before' ? toIdx : toIdx + (fromIdx < toIdx ? 0 : 1)
      arr.splice(Math.max(0, insertAt), 0, moved)
      return arr
    })
    setDragId(null); setDragOverId(null)
  }

  function handleDragEnd() { setDragId(null); setDragOverId(null) }

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflowY: 'auto', padding: '52px 48px 52px 52px', position: 'relative' }}
      onMouseUp={handleMouseUp}
      onClick={() => onShowPopup({ visible: false })}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.accent, marginBottom: 7 }}>
          Story Overview
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.textPri, letterSpacing: '-0.02em', marginBottom: 32, fontFamily: "'Georgia', serif", lineHeight: 1.2 }}>
          The Awakened Scribe
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {blocks.map(block => (
            <OverviewBlock
              key={block.id}
              block={block}
              chapOrder={chapOrder}
              chapMap={chapMap}
              hoveredChapId={hoveredChapId}
              onHover={onHover}
              onOpenChap={onOpenChap}
              isDragging={dragId === block.id}
              isDragOver={dragOverId === block.id}
              dragOverPos={dragOverPos}
              onDragStart={() => handleDragStart(block.id)}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, block.id)}
            />
          ))}
          <div style={{ paddingLeft: 28, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: C.textMut, cursor: 'pointer' }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 12, fontStyle: 'italic' }}>Add a block</span>
          </div>
        </div>

        <div style={{ marginTop: 44, display: 'flex', alignItems: 'center', gap: 7, color: C.textMut }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" opacity="0.4"/>
            <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" opacity="0.4"/>
            <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" opacity="0.4"/>
            <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" opacity="0.4"/>
          </svg>
          <span style={{ fontSize: 11, fontStyle: 'italic' }}>Drag blocks to reorder · select text to nest a chapter · click a highlight to open it</span>
        </div>
      </div>
    </div>
  )
}

// ── Main OverviewView ─────────────────────────────────────────────────────────
export default function OverviewView({ docs, onOpenDoc }: Props) {
  const chapters = useMemo(() => docs.filter(d => d.type === 'chapter'), [docs])

  const chapMap = useMemo<Map<string, ChapMeta>>(() => {
    const map = new Map<string, ChapMeta>()
    chapters.forEach((ch, i) => {
      map.set(ch.id, {
        id: ch.id,
        title: ch.title,
        color: PALETTERGB[i % PALETTERGB.length],
        scenes: 0,
      })
    })
    return map
  }, [chapters])

  const [blocks, setBlocksRaw] = useState<Block[]>(() => loadBlocks(chapters))
  const [hoveredChapId, setHoveredChapId] = useState<string | null>(null)
  const [zoomedChap, setZoomedChap] = useState<{ id: string; sourceText: string } | null>(null)
  const [popup, setPopup] = useState<{ visible: boolean; top?: number; left?: number }>({ visible: false })

  const setBlocks = useCallback((updater: React.SetStateAction<Block[]>) => {
    setBlocksRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const chapOrder = useMemo(() => getChapOrder(blocks), [blocks])

  function openChap(chapId: string, sourceText: string) {
    setZoomedChap({ id: chapId, sourceText })
    setPopup({ visible: false })
  }

  function openChapFromSidebar(chapId: string) {
    const seg = blocks.flatMap(b => b.segments).find(s => s.chaps.includes(chapId))
    openChap(chapId, seg ? seg.text.trim() : '')
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: C.base, overflow: 'hidden' }}>
      <style>{`
        @keyframes ovZoomIn { from { opacity:0; transform:scale(0.975) } to { opacity:1; transform:scale(1) } }
        @keyframes ovFadeUp  { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {zoomedChap ? (
        <ChapterZoomView
          chapId={zoomedChap.id}
          sourceText={zoomedChap.sourceText}
          chapMap={chapMap}
          onBack={() => setZoomedChap(null)}
          onOpenDoc={onOpenDoc}
        />
      ) : (
        <>
          <OverviewSidebar
            chapOrder={chapOrder}
            chapMap={chapMap}
            hoveredChapId={hoveredChapId}
            onHover={setHoveredChapId}
            onSelect={openChapFromSidebar}
          />
          <TimelineStrip
            blocks={blocks}
            chapOrder={chapOrder}
            chapMap={chapMap}
            hoveredChapId={hoveredChapId}
            onHover={setHoveredChapId}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            {popup.visible && (
              <SelectionPopup
                top={popup.top ?? 0}
                left={popup.left ?? 0}
                chapMap={chapMap}
                onClose={() => setPopup({ visible: false })}
              />
            )}
            <OverviewTextBody
              blocks={blocks}
              setBlocks={setBlocks}
              chapOrder={chapOrder}
              chapMap={chapMap}
              hoveredChapId={hoveredChapId}
              onHover={setHoveredChapId}
              onOpenChap={openChap}
              onShowPopup={setPopup}
            />
            <div style={{
              height: 26, flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.raised,
              display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 16,
            }}>
              <span style={{ fontSize: 11, color: C.textMut }}>{chapters.length} chapters</span>
              <div style={{ flex: 1 }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }}/>
                <span style={{ fontSize: 11, color: C.textMut, fontFamily: 'monospace' }}>main</span>
              </div>
              <span style={{ fontSize: 11, color: C.textMut }}>Autosaved</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
