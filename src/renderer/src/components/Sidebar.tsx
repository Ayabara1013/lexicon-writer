import { useState, useMemo } from 'react'
import type { DocMeta } from '../env'

const C = {
  raised:    '#1a1825',
  overlay:   '#252235',
  border:    '#2a2740',
  accent:    '#7c6af7',
  accentLt:  '#9d8ef9',
  accentBg:  'rgba(124,106,247,0.10)',
  accentDm:  '#3d357a',
  textPri:   '#e8e5f5',
  textSec:   '#a09cc0',
  textMut:   '#55507a',
  green:     '#34d399',
  amber:     '#f59e0b',
}

const GOAL_WORDS = 80000
const TODAY_GOAL = 2000

type Props = {
  docs: DocMeta[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (type: 'chapter' | 'note') => void
  onCreateSub: (parentId: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onReorder: (ids: string[]) => void
}

function countWords(content: string | null | undefined): number {
  if (!content) return 0
  try {
    const parsed = JSON.parse(content)
    const text = extractText(parsed)
    return text.split(/\s+/).filter(Boolean).length
  } catch {
    return content.split(/\s+/).filter(Boolean).length
  }
}

function extractText(node: Record<string, unknown>): string {
  if (node.type === 'text') return String(node.text || '')
  if (Array.isArray(node.content)) return (node.content as Record<string, unknown>[]).map(extractText).join(' ')
  return ''
}

export default function Sidebar({ docs, activeId, onSelect, onCreate, onCreateSub, onRename, onDelete, onReorder }: Props) {
  const [tab, setTab] = useState<'chapter' | 'note'>('chapter')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const chapters = useMemo(() => docs.filter((d) => d.type === 'chapter'), [docs])

  const totalWords = useMemo(() =>
    chapters.reduce((sum, d) => sum + countWords((d as DocMeta & { content?: string }).content), 0),
    [chapters]
  )

  function startRename(doc: DocMeta) {
    setRenamingId(doc.id)
    setRenameValue(doc.title)
  }

  function commitRename(id: string) {
    if (renameValue.trim()) onRename(id, renameValue.trim())
    setRenamingId(null)
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tabDocs = docs.filter((d) => d.type === tab)
  const docIds = new Set(docs.map((d) => d.id))
  const allRoots = tabDocs.filter((d) => !d.parent_id || !docIds.has(d.parent_id))
  const childrenOf = (id: string) => tabDocs.filter((d) => d.parent_id === id)

  const filteredRoots = search
    ? allRoots.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    : allRoots

  const goalPct = Math.min(Math.round((totalWords / GOAL_WORDS) * 100), 100)

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDropTargetId(null); return }
    const roots = allRoots
    const fromIdx = roots.findIndex((d) => d.id === dragId)
    const toIdx = roots.findIndex((d) => d.id === targetId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDropTargetId(null); return }
    const reordered = [...roots]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    onReorder(reordered.map((d) => d.id))
    setDragId(null); setDropTargetId(null)
  }

  function renderDoc(doc: DocMeta, depth = 0) {
    const children = childrenOf(doc.id)
    const hasChildren = children.length > 0
    const isCollapsedNow = collapsed.has(doc.id)
    const isActive = activeId === doc.id
    const isRenaming = renamingId === doc.id
    const isDragging = dragId === doc.id
    const isDropTarget = dropTargetId === doc.id && dragId !== doc.id

    return (
      <div key={doc.id}
        draggable={depth === 0 && !isRenaming}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(doc.id) }}
        onDragOver={(e) => { e.preventDefault(); setDropTargetId(doc.id) }}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={() => handleDrop(doc.id)}
        onDragEnd={() => { setDragId(null); setDropTargetId(null) }}
        style={{ opacity: isDragging ? 0.4 : 1, borderTop: isDropTarget ? `2px solid ${C.accent}` : '2px solid transparent' }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} className="group">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(doc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(doc.id)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              style={{
                flex: 1, minWidth: 0, margin: '1px 4px',
                padding: '4px 8px', borderRadius: 5, fontSize: 12,
                background: C.overlay, color: C.textPri,
                border: `1px solid ${C.accentDm}`, outline: 'none',
              }}
            />
          ) : (
            <button
              onClick={() => onSelect(doc.id)}
              onDoubleClick={() => startRename(doc)}
              style={{
                flex: 1, minWidth: 0, textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 7,
                paddingLeft: depth === 0 ? 10 : 28,
                paddingRight: 10, paddingTop: 4, paddingBottom: 4,
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: isActive ? C.accentBg : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: isActive ? C.accent : (hasChildren ? 'transparent' : C.textMut),
                border: hasChildren ? `1px solid ${C.textMut}` : 'none',
              }}/>
              <span style={{
                flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: isActive ? C.accentLt : C.textSec,
                fontWeight: isActive ? 500 : 400,
              }}>{doc.title}</span>
              {hasChildren && isCollapsedNow && (
                <span style={{ fontSize: 10, color: C.textMut }}>+{children.length}</span>
              )}
              {hasChildren && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(doc.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: C.textMut, fontSize: 9, transform: isCollapsedNow ? 'rotate(-90deg)' : 'none',
                    transition: 'transform 0.15s', flexShrink: 0,
                  }}
                >▾</button>
              )}
            </button>
          )}

          {/* Hover actions */}
          {!isRenaming && (
            <div className="hidden group-hover:flex" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 2 }}>
              {tab === 'chapter' && (
                <button
                  onClick={() => onCreateSub(doc.id)}
                  title="Add sub-chapter"
                  style={{
                    width: 18, height: 18, borderRadius: 4, border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', cursor: 'pointer', color: C.textMut,
                    fontSize: 11,
                  }}
                >+</button>
              )}
              <button
                onClick={() => onDelete(doc.id)}
                title="Delete"
                style={{
                  width: 18, height: 18, borderRadius: 4, border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', cursor: 'pointer', color: C.textMut,
                  fontSize: 10,
                }}
              >✕</button>
            </div>
          )}
        </div>

        {hasChildren && !isCollapsedNow && (
          <div style={{ borderLeft: `1px solid ${C.border}`, marginLeft: 16 }}>
            {children.map((child) => renderDoc(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: C.raised,
      borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
    }}>
      {/* Project header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Project</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textPri, letterSpacing: '-0.01em' }}>
            {docs[0]?.title?.split(':')[0] ?? 'My Novel'}
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: C.textMut, flexShrink: 0 }}>
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {(['chapter', 'note'] as const).map((t) => {
          const isActive = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, textAlign: 'center', padding: '8px 0',
              fontSize: 11, fontWeight: isActive ? 600 : 400,
              color: isActive ? C.accentLt : C.textMut,
              borderBottom: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
              border: 'none', background: 'transparent', cursor: 'pointer',
              letterSpacing: '0.02em',
            }}>
              {t === 'chapter' ? 'Chapters' : 'Notes'}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.overlay, borderRadius: 6, padding: '5px 8px',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: C.textMut, flexShrink: 0 }}>
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find in manuscript…"
            style={{
              background: 'none', border: 'none', outline: 'none', flex: 1,
              fontSize: 11, color: C.textSec,
            }}
          />
        </div>
      </div>

      {/* Doc list */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {filteredRoots.map((doc) => renderDoc(doc))}
        {filteredRoots.length === 0 && (
          <p style={{ fontSize: 11, color: C.textMut, padding: '16px 14px', textAlign: 'center' }}>
            {search ? 'No matches' : `No ${tab === 'chapter' ? 'chapters' : 'notes'} yet`}
          </p>
        )}
        <div style={{ padding: '4px 8px 2px' }}>
          <button
            onClick={() => onCreate(tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', borderRadius: 6, border: 'none',
              background: 'transparent', cursor: 'pointer', color: C.textMut,
              fontSize: 11, width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>New {tab === 'chapter' ? 'chapter' : 'note'}</span>
          </button>
        </div>
      </nav>

      {/* Stats footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.textMut }}>Novel progress</span>
          <span style={{ fontSize: 10, color: C.textMut }}>{totalWords.toLocaleString()} / {(GOAL_WORDS / 1000).toFixed(0)}k</span>
        </div>
        <div style={{ height: 3, background: C.overlay, borderRadius: 2, marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${goalPct}%`, background: C.accent, borderRadius: 2, transition: 'width 0.3s' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.textMut }}>Today</span>
          <span style={{ fontSize: 10, color: C.textMut }}>— / {TODAY_GOAL.toLocaleString()}</span>
        </div>
        <div style={{ height: 3, background: C.overlay, borderRadius: 2 }}>
          <div style={{ height: '100%', width: '0%', background: C.amber, borderRadius: 2 }}/>
        </div>
      </div>
    </aside>
  )
}
