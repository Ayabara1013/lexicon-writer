import { useState, useEffect } from 'react'
import type { CanvasNode, CanvasEdge, DocMeta } from '../env'

const COLORS = [
  { label: 'Violet', value: '#7c6af7' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Cyan',   value: '#06b6d4' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Amber',  value: '#f59e0b' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Pink',   value: '#ec4899' },
  { label: 'White',  value: '#e8e5f5' },
]

const SHAPES = [
  { label: 'Circle',        value: 'circle',       icon: '○' },
  { label: 'Diamond',       value: 'diamond',      icon: '◇' },
  { label: 'Hexagon',       value: 'hexagon',      icon: '⬡' },
  { label: 'Square',        value: 'square',       icon: '□' },
  { label: 'Rectangle',     value: 'rectangle',    icon: '▭' },
  { label: 'Rounded Square',value: 'roundedSquare',icon: '▢' },
] as const

const EDGE_STYLES = [
  { label: 'Straight', value: 'straight', icon: '—' },
  { label: 'Spline',   value: 'bezier',   icon: '∫' },
  { label: 'Angles',   value: 'step',     icon: '⌐' },
] as const

type NodeCallbacks = {
  onLabelChange: (id: string, label: string) => void
  onColorChange: (id: string, color: string | null) => void
  onTypeChange: (id: string, type: 'skill' | 'note' | 'group') => void
  onIconChange: (id: string, icon: string | null) => void
  onShapeChange: (id: string, shape: string) => void
  onLinkedDocChange: (id: string, docId: string | null) => void
  onCollapseToggle: (id: string) => void
  onRemoveFromGroup: (id: string) => void
  onDelete: (id: string) => void
}

type EdgeCallbacks = {
  onLabelChange: (id: string, label: string | null) => void
  onColorChange: (id: string, color: string | null) => void
  onAnimatedToggle: (id: string, animated: boolean) => void
  onEdgeStyleChange: (id: string, style: string) => void
  onDelete: (id: string) => void
}

type Props = {
  node: CanvasNode | null
  edge: CanvasEdge | null
  docs: DocMeta[]
  nodeCallbacks: NodeCallbacks
  edgeCallbacks: EdgeCallbacks
  onClose: () => void
}

export default function CanvasInspector({ node, edge, docs, nodeCallbacks, edgeCallbacks, onClose }: Props) {
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeIcon, setNodeIcon] = useState('')
  const [edgeLabel, setEdgeLabel] = useState('')

  useEffect(() => { setNodeLabel(node?.label ?? '') }, [node?.id, node?.label])
  useEffect(() => { setNodeIcon(node?.icon ?? '') }, [node?.id, node?.icon])
  useEffect(() => { setEdgeLabel(edge?.label ?? '') }, [edge?.id, edge?.label])

  const isOpen = node !== null || edge !== null
  if (!isOpen) return null

  const nodeTypeIcon = node?.type === 'skill' ? '⚡ Skill' : node?.type === 'note' ? '📄 Note' : '▣ Group'

  return (
    <div className="absolute right-0 top-0 h-full w-64 bg-base-200 border-l border-base-300 z-20 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-base-300">
        <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
          {node ? nodeTypeIcon : '— Line'}
        </span>
        <button className="btn btn-xs btn-ghost text-base-content/40" onClick={onClose}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {node && (
          <>
            {/* Label */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Label</label>
              <input
                className="input input-sm input-bordered w-full"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                onBlur={() => { if (nodeLabel !== node.label) nodeCallbacks.onLabelChange(node.id, nodeLabel) }}
                onKeyDown={(e) => { if (e.key === 'Enter') nodeCallbacks.onLabelChange(node.id, nodeLabel) }}
              />
            </div>

            {/* Type — only allow switching between skill and note, not group */}
            {node.type !== 'group' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Type</label>
                <div className="flex gap-1">
                  {(['skill', 'note'] as const).map((t) => (
                    <button
                      key={t}
                      className={`btn btn-xs flex-1 ${node.type === t ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => nodeCallbacks.onTypeChange(node.id, t)}
                    >
                      {t === 'skill' ? '⚡' : '📄'} {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Icon (skill/note only) */}
            {node.type !== 'group' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Icon (emoji)</label>
                <div className="flex gap-2 items-center">
                  <input
                    className="input input-sm input-bordered w-full text-center text-lg"
                    placeholder="🔥"
                    maxLength={2}
                    value={nodeIcon}
                    onChange={(e) => setNodeIcon(e.target.value)}
                    onBlur={() => nodeCallbacks.onIconChange(node.id, nodeIcon.trim() || null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') nodeCallbacks.onIconChange(node.id, nodeIcon.trim() || null) }}
                  />
                  {nodeIcon && (
                    <button
                      className="btn btn-xs btn-ghost text-base-content/40"
                      onClick={() => { setNodeIcon(''); nodeCallbacks.onIconChange(node.id, null) }}
                    >✕</button>
                  )}
                </div>
              </div>
            )}

            {/* Shape (skill only) */}
            {node.type === 'skill' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Shape</label>
                <div className="flex gap-1">
                  {SHAPES.map((s) => (
                    <button
                      key={s.value}
                      className={`btn btn-xs flex-1 ${(node.shape ?? 'circle') === s.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                      title={s.label}
                      onClick={() => nodeCallbacks.onShapeChange(node.id, s.value)}
                    >
                      {s.icon}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className={`w-6 h-6 rounded-full border-2 bg-base-300 ${!node.color ? 'border-white' : 'border-transparent'}`}
                  title={node.type === 'group' ? 'Default' : 'Core (no color)'}
                  onClick={() => nodeCallbacks.onColorChange(node.id, null)}
                />
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ background: c.value, borderColor: node.color === c.value ? 'white' : 'transparent' }}
                    title={c.label}
                    onClick={() => nodeCallbacks.onColorChange(node.id, c.value)}
                  />
                ))}
              </div>
            </div>

            {/* Group size (read-only display) */}
            {node.type === 'group' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Size</label>
                <div className="text-xs text-base-content/50">
                  {Math.round(node.width ?? 300)} × {Math.round(node.height ?? 200)} px
                  <span className="ml-1 text-base-content/30">(drag edges to resize)</span>
                </div>
              </div>
            )}

            {/* Linked doc (note type only) */}
            {node.type === 'note' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Linked document</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={node.linked_doc_id ?? ''}
                  onChange={(e) => nodeCallbacks.onLinkedDocChange(node.id, e.target.value || null)}
                >
                  <option value="">— none —</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Collapse (skill/note only) */}
            {node.type !== 'group' && (
              <div>
                <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Subtree</label>
                <button
                  className={`btn btn-xs w-full ${node.collapsed ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => nodeCallbacks.onCollapseToggle(node.id)}
                >
                  {node.collapsed ? '▶ Expand children' : '▼ Collapse children'}
                </button>
              </div>
            )}

            {/* Remove from group */}
            {node.group_id && (
              <div>
                <button
                  className="btn btn-xs btn-ghost border border-base-300 w-full"
                  onClick={() => nodeCallbacks.onRemoveFromGroup(node.id)}
                >
                  ⬖ Remove from group
                </button>
              </div>
            )}

            {/* Delete */}
            <div className="mt-auto pt-2 border-t border-base-300">
              <button className="btn btn-xs btn-error btn-outline w-full" onClick={() => nodeCallbacks.onDelete(node.id)}>
                🗑 Delete {node.type === 'group' ? 'group' : 'node'}
              </button>
            </div>
          </>
        )}

        {edge && (
          <>
            {/* Label */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">
                Relationship label
              </label>
              <input
                className="input input-sm input-bordered w-full"
                placeholder="e.g. requires, unlocks…"
                value={edgeLabel}
                onChange={(e) => setEdgeLabel(e.target.value)}
                onBlur={() => edgeCallbacks.onLabelChange(edge.id, edgeLabel || null)}
                onKeyDown={(e) => { if (e.key === 'Enter') edgeCallbacks.onLabelChange(edge.id, edgeLabel || null) }}
              />
            </div>

            {/* Color */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className={`w-6 h-6 rounded-full border-2 bg-base-300 ${!edge.color ? 'border-white' : 'border-transparent'}`}
                  title="Inherit from nodes"
                  onClick={() => edgeCallbacks.onColorChange(edge.id, null)}
                />
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ background: c.value, borderColor: edge.color === c.value ? 'white' : 'transparent' }}
                    title={c.label}
                    onClick={() => edgeCallbacks.onColorChange(edge.id, c.value)}
                  />
                ))}
              </div>
            </div>

            {/* Line style */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Line style</label>
              <div className="flex gap-1">
                {EDGE_STYLES.map((s) => (
                  <button
                    key={s.value}
                    className={`btn btn-xs flex-1 ${(edge.edge_style ?? 'straight') === s.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                    title={s.label}
                    onClick={() => edgeCallbacks.onEdgeStyleChange(edge.id, s.value)}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Animated */}
            <div>
              <label className="text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block">Animation</label>
              <button
                className={`btn btn-xs w-full ${edge.animated ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                onClick={() => edgeCallbacks.onAnimatedToggle(edge.id, !edge.animated)}
              >
                {edge.animated ? '✦ Animated flow' : '— Static'}
              </button>
            </div>

            {/* Delete */}
            <div className="mt-auto pt-2 border-t border-base-300">
              <button className="btn btn-xs btn-error btn-outline w-full" onClick={() => edgeCallbacks.onDelete(edge.id)}>
                🗑 Delete line
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
