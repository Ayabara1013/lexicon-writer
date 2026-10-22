import { useState, useRef, useEffect } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { WindowType } from '../extensions/SystemWindow'

const STYLES: Record<WindowType, {
  outer: string
  header: string
  badge: string
  label: string
}> = {
  status: {
    outer: 'bg-gradient-to-br from-blue-950/90 to-slate-950/95 border border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]',
    header: 'bg-blue-900/40 border-b border-blue-500/30',
    badge: 'bg-blue-500 text-white',
    label: 'STATUS'
  },
  achievement: {
    outer: 'bg-gradient-to-br from-yellow-950/90 to-slate-950/95 border border-yellow-500/40 shadow-[0_0_20px_rgba(234,179,8,0.15)]',
    header: 'bg-yellow-900/40 border-b border-yellow-500/30',
    badge: 'bg-yellow-500 text-black',
    label: 'ACHIEVEMENT'
  },
  quest: {
    outer: 'bg-gradient-to-br from-emerald-950/90 to-slate-950/95 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    header: 'bg-emerald-900/40 border-b border-emerald-500/30',
    badge: 'bg-emerald-500 text-white',
    label: 'QUEST'
  },
  item: {
    outer: 'bg-gradient-to-br from-purple-950/90 to-slate-950/95 border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    header: 'bg-purple-900/40 border-b border-purple-500/30',
    badge: 'bg-purple-500 text-white',
    label: 'ITEM'
  },
  skill: {
    outer: 'bg-gradient-to-br from-cyan-950/90 to-slate-950/95 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)]',
    header: 'bg-cyan-900/40 border-b border-cyan-500/30',
    badge: 'bg-cyan-500 text-white',
    label: 'SKILL'
  },
  notification: {
    outer: 'bg-gradient-to-br from-slate-800/90 to-slate-950/95 border border-slate-500/40 shadow-[0_0_20px_rgba(148,163,184,0.1)]',
    header: 'bg-slate-700/40 border-b border-slate-500/30',
    badge: 'bg-slate-500 text-white',
    label: 'NOTIFICATION'
  }
}

const WINDOW_TYPES: WindowType[] = ['status', 'achievement', 'quest', 'item', 'skill', 'notification']

export default function SystemWindowView({ node, updateAttributes, selected }: NodeViewProps) {
  const windowType = (node.attrs.windowType as WindowType) ?? 'status'
  const title = node.attrs.title as string
  const s = STYLES[windowType]

  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typeMenuOpen) return
    function handler(e: MouseEvent) {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [typeMenuOpen])

  return (
    <NodeViewWrapper>
      <div className={`my-6 mx-auto max-w-lg rounded-lg overflow-hidden font-mono text-sm ${s.outer} ${selected ? 'ring-2 ring-offset-1 ring-offset-base-100 ring-primary/60' : ''}`}>

        {/* Header — non-editable */}
        <div className={`flex items-center gap-2 px-4 py-2.5 ${s.header}`} contentEditable={false}>
          <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded flex-shrink-0 ${s.badge}`}>
            {s.label}
          </span>

          <input
            className="flex-1 min-w-0 bg-transparent text-white/90 font-semibold text-sm tracking-wide outline-none placeholder:text-white/30"
            value={title}
            placeholder="Window title…"
            onChange={(e) => updateAttributes({ title: e.target.value })}
          />

          {/* Custom type picker */}
          <div className="relative flex-shrink-0" ref={typeMenuRef}>
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTypeMenuOpen((o) => !o) }}
              className="text-white/40 text-xs hover:text-white/80 transition-colors flex items-center gap-1 px-1"
            >
              <span className="capitalize">{windowType}</span>
              <span className="text-[9px]">▾</span>
            </button>
            {typeMenuOpen && (
              <div className="absolute right-0 top-full mt-1 flex flex-col bg-base-200 border border-base-300 rounded-lg shadow-xl py-1 z-50 min-w-[130px]">
                {WINDOW_TYPES.map((t) => (
                  <button
                    key={t}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      updateAttributes({ windowType: t })
                      setTypeMenuOpen(false)
                    }}
                    className={`px-3 py-1.5 text-left text-xs capitalize transition-colors ${
                      t === windowType
                        ? 'text-primary bg-primary/10'
                        : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content — editable */}
        <div className="px-5 py-4 text-white/90">
          <NodeViewContent className="outline-none [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0" />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
