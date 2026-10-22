import { useState, useEffect } from 'react'
import type { CanvasNode, CanvasEdge, CanvasNodeType, CanvasNodeFields, CanvasEdgeFields, NodeRequirement, NodeShape, DocMeta } from '../env'
import { EDGE_KIND_META, EDGE_KINDS, NODE_TYPE_META, isTalent, parseRequirements, rankLabel, serializeRequirements } from '../talent/model'

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

const NODE_TYPES: CanvasNodeType[] = ['skill', 'passive', 'stat', 'keystone', 'note']

type NodeCallbacks = {
  onLabelChange: (id: string, label: string) => void
  onColorChange: (id: string, color: string | null) => void
  onTypeChange: (id: string, type: CanvasNodeType) => void
  onIconChange: (id: string, icon: string | null) => void
  onShapeChange: (id: string, shape: NodeShape) => void
  onLinkedDocChange: (id: string, docId: string | null) => void
  onCollapseToggle: (id: string) => void
  onRemoveFromGroup: (id: string) => void
  onFieldsChange: (id: string, fields: CanvasNodeFields) => void
  onDelete: (id: string) => void
}

type EdgeCallbacks = {
  onLabelChange: (id: string, label: string | null) => void
  onColorChange: (id: string, color: string | null) => void
  onAnimatedToggle: (id: string, animated: boolean) => void
  onEdgeStyleChange: (id: string, style: string) => void
  onFieldsChange: (id: string, fields: CanvasEdgeFields) => void
  onDelete: (id: string) => void
}

type Props = {
  node: CanvasNode | null
  edge: CanvasEdge | null
  allNodes: CanvasNode[]
  allEdges: CanvasEdge[]
  docs: DocMeta[]
  nodeCallbacks: NodeCallbacks
  edgeCallbacks: EdgeCallbacks
  onSelectNode: (id: string) => void
  onSelectEdge: (id: string) => void
  onClose: () => void
}

const sectionLabel = 'text-[10px] uppercase tracking-wide text-base-content/40 mb-1 block'

/** Integer input that commits on blur / Enter, clamped to [min, max] */
function NumberField({ value, min, max, onCommit, className = '' }: { value: number; min: number; max: number; onCommit: (n: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  function commit() {
    const n = parseInt(draft, 10)
    if (Number.isNaN(n)) { setDraft(String(value)); return }
    const clamped = Math.min(max, Math.max(min, n))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <input
      type="number" min={min} max={max}
      className={`input input-sm input-bordered w-16 px-2 ${className}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
    />
  )
}

function TextField({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <input
      className="input input-xs input-bordered flex-1 min-w-0"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && draft !== value) onCommit(draft) }}
    />
  )
}

function RequirementsEditor({ reqs, inGroup, onChange }: { reqs: NodeRequirement[]; inGroup: boolean; onChange: (reqs: NodeRequirement[]) => void }) {
  const set = (i: number, r: NodeRequirement) => onChange(reqs.map((x, j) => (j === i ? r : x)))
  const remove = (i: number) => onChange(reqs.filter((_, j) => j !== i))
  return (
    <div className="flex flex-col gap-1.5">
      {reqs.map((r, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          {r.kind === 'points_spent' && (
            <>
              <NumberField value={r.min} min={1} max={999} onCommit={(min) => set(i, { ...r, min })} className="input-xs w-14" />
              <span className="text-base-content/60 shrink-0">pts in</span>
              <select className="select select-xs select-bordered flex-1 min-w-0" value={r.scope} onChange={(e) => set(i, { ...r, scope: e.target.value as 'tree' | 'group' })}>
                <option value="tree">tree</option>
                <option value="group">{inGroup ? 'this group' : 'group (none)'}</option>
              </select>
            </>
          )}
          {r.kind === 'level' && (
            <>
              <span className="text-base-content/60 shrink-0">Level ≥</span>
              <NumberField value={r.min} min={1} max={999} onCommit={(min) => set(i, { ...r, min })} className="input-xs w-14" />
              <span className="flex-1" />
            </>
          )}
          {r.kind === 'custom' && (
            <TextField value={r.text} placeholder="e.g. STR 20, finish quest…" onCommit={(text) => set(i, { ...r, text })} />
          )}
          <button className="btn btn-xs btn-ghost text-base-content/40 px-1" title="Remove" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <div className="flex gap-1 flex-wrap">
        <button className="btn btn-xs btn-ghost border border-base-300" title="Points already spent elsewhere in the tree or group" onClick={() => onChange([...reqs, { kind: 'points_spent', scope: inGroup ? 'group' : 'tree', min: 5 }])}>+ Points spent</button>
        <button className="btn btn-xs btn-ghost border border-base-300" title="Minimum character level" onClick={() => onChange([...reqs, { kind: 'level', min: 10 }])}>+ Level</button>
        <button className="btn btn-xs btn-ghost border border-base-300" title="Free text — shown, not enforced" onClick={() => onChange([...reqs, { kind: 'custom', text: '' }])}>+ Other</button>
      </div>
    </div>
  )
}

export default function CanvasInspector({ node, edge, allNodes, allEdges, docs, nodeCallbacks, edgeCallbacks, onSelectNode, onSelectEdge, onClose }: Props) {
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeIcon, setNodeIcon] = useState('')
  const [nodeDescription, setNodeDescription] = useState('')
  const [edgeLabel, setEdgeLabel] = useState('')

  useEffect(() => { setNodeLabel(node?.label ?? '') }, [node?.id, node?.label])
  useEffect(() => { setNodeIcon(node?.icon ?? '') }, [node?.id, node?.icon])
  useEffect(() => { setNodeDescription(node?.description ?? '') }, [node?.id, node?.description])
  useEffect(() => { setEdgeLabel(edge?.label ?? '') }, [edge?.id, edge?.label])

  const isOpen = node !== null || edge !== null
  if (!isOpen) return null

  const byId = (id: string) => allNodes.find((n) => n.id === id)
  const talent = node ? isTalent(node) : false
  const incoming = node ? allEdges.filter((e) => e.to_id === node.id && e.kind === 'prereq') : []
  const outgoing = node ? allEdges.filter((e) => e.from_id === node.id && e.kind === 'prereq') : []
  const exclusive = node ? allEdges.filter((e) => e.kind === 'exclusive' && (e.from_id === node.id || e.to_id === node.id)) : []
  const edgeFrom = edge ? byId(edge.from_id) : undefined
  const edgeTo = edge ? byId(edge.to_id) : undefined

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-base-200 border-l border-base-300 z-20 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-base-300">
        <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
          {node ? `${NODE_TYPE_META[node.type].icon} ${NODE_TYPE_META[node.type].label}` : `${EDGE_KIND_META[edge!.kind].icon} ${EDGE_KIND_META[edge!.kind].label} link`}
        </span>
        <button className="btn btn-xs btn-ghost text-base-content/40" onClick={onClose}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {node && (
          <>
            {/* Label */}
            <div>
              <label className={sectionLabel}>Label</label>
              <input
                className="input input-sm input-bordered w-full"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                onBlur={() => { if (nodeLabel !== node.label) nodeCallbacks.onLabelChange(node.id, nodeLabel) }}
                onKeyDown={(e) => { if (e.key === 'Enter') nodeCallbacks.onLabelChange(node.id, nodeLabel) }}
              />
            </div>

            {/* Type — groups can't be switched */}
            {node.type !== 'group' && (
              <div>
                <label className={sectionLabel}>Type</label>
                <div className="grid grid-cols-5 gap-1">
                  {NODE_TYPES.map((t) => (
                    <button
                      key={t}
                      className={`btn btn-xs px-0 ${node.type === t ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                      title={`${NODE_TYPE_META[t].label} — ${NODE_TYPE_META[t].hint}`}
                      onClick={() => nodeCallbacks.onTypeChange(node.id, t)}
                    >
                      {NODE_TYPE_META[t].icon}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Talent rules */}
            {talent && (
              <>
                <div>
                  <label className={sectionLabel}>Description</label>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full leading-snug"
                    rows={3}
                    placeholder="What does it do? e.g. +10% fire damage per rank"
                    value={nodeDescription}
                    onChange={(e) => setNodeDescription(e.target.value)}
                    onBlur={() => { if (nodeDescription !== (node.description ?? '')) nodeCallbacks.onFieldsChange(node.id, { description: nodeDescription || null }) }}
                  />
                </div>

                <div className="flex gap-3">
                  <div>
                    <label className={sectionLabel}>Ranks</label>
                    <NumberField value={node.max_rank} min={1} max={99} onCommit={(max_rank) => nodeCallbacks.onFieldsChange(node.id, { max_rank })} />
                  </div>
                  <div>
                    <label className={sectionLabel}>Cost / rank</label>
                    <NumberField value={node.point_cost} min={0} max={99} onCommit={(point_cost) => nodeCallbacks.onFieldsChange(node.id, { point_cost })} />
                  </div>
                  <div className="flex-1 text-right">
                    <label className={sectionLabel}>Total</label>
                    <div className="text-sm text-base-content/60 pt-1">{node.max_rank * node.point_cost} pts</div>
                  </div>
                </div>

                <div>
                  <label className={sectionLabel}>Prerequisites</label>
                  {incoming.length === 0
                    ? <div className="text-xs text-base-content/30">None — drag a link into this node, or create it as a sub-node (Tab)</div>
                    : (
                      <div className="flex flex-col gap-0.5">
                        {incoming.map((e) => {
                          const src = byId(e.from_id)
                          return (
                            <button key={e.id} className="text-left text-xs hover:text-primary truncate" title="Edit link" onClick={() => onSelectEdge(e.id)}>
                              ← {src?.label ?? '?'} <span className="text-base-content/40">{rankLabel(Math.min(e.min_rank, src?.max_rank ?? e.min_rank), src?.max_rank ?? e.min_rank)}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  {incoming.length > 1 && (
                    <div className="flex gap-1 mt-1.5">
                      {(['all', 'any'] as const).map((m) => (
                        <button
                          key={m}
                          className={`btn btn-xs flex-1 ${node.prereq_mode === m ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                          onClick={() => nodeCallbacks.onFieldsChange(node.id, { prereq_mode: m })}
                        >
                          {m === 'all' ? 'Needs all' : 'Needs any one'}
                        </button>
                      ))}
                    </div>
                  )}
                  {(outgoing.length > 0 || exclusive.length > 0) && (
                    <div className="flex flex-col gap-0.5 mt-1.5 text-xs text-base-content/50">
                      {outgoing.map((e) => (
                        <button key={e.id} className="text-left hover:text-primary truncate" onClick={() => onSelectNode(e.to_id)}>→ unlocks {byId(e.to_id)?.label ?? '?'}</button>
                      ))}
                      {exclusive.map((e) => {
                        const other = byId(e.from_id === node.id ? e.to_id : e.from_id)
                        return <button key={e.id} className="text-left hover:text-primary truncate text-error/70" onClick={() => onSelectEdge(e.id)}>✕ excludes {other?.label ?? '?'}</button>
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className={sectionLabel}>Other requirements</label>
                  <RequirementsEditor
                    reqs={parseRequirements(node.requirements)}
                    inGroup={!!node.group_id}
                    onChange={(reqs) => nodeCallbacks.onFieldsChange(node.id, { requirements: serializeRequirements(reqs) })}
                  />
                </div>
              </>
            )}

            {/* Icon (skill/note only) */}
            {node.type !== 'group' && (
              <div>
                <label className={sectionLabel}>Icon (emoji)</label>
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

            {/* Shape (talents only) */}
            {talent && (
              <div>
                <label className={sectionLabel}>Shape</label>
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
              <label className={sectionLabel}>Color</label>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className={`w-6 h-6 rounded-full border-2 bg-base-300 ${!node.color ? 'border-white' : 'border-transparent'}`}
                  title={node.type === 'group' ? 'Default' : 'Inherit / core (no color)'}
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
                <label className={sectionLabel}>Size</label>
                <div className="text-xs text-base-content/50">
                  {Math.round(node.width ?? 300)} × {Math.round(node.height ?? 200)} px
                  <span className="ml-1 text-base-content/30">(drag edges to resize)</span>
                </div>
              </div>
            )}

            {/* Linked doc (note type only) */}
            {node.type === 'note' && (
              <div>
                <label className={sectionLabel}>Linked document</label>
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

            {/* Collapse (non-group only) */}
            {node.type !== 'group' && (
              <div>
                <label className={sectionLabel}>Sub-nodes</label>
                <button
                  className={`btn btn-xs w-full ${node.collapsed ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => nodeCallbacks.onCollapseToggle(node.id)}
                >
                  {node.collapsed ? '▶ Expand sub-nodes' : '▼ Collapse sub-nodes'}
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
            {/* Endpoints */}
            <div className="text-xs flex items-center gap-1.5 min-w-0">
              <button className="truncate hover:text-primary" onClick={() => onSelectNode(edge.from_id)}>{edgeFrom?.label ?? '?'}</button>
              <span className="text-base-content/40 shrink-0">{EDGE_KIND_META[edge.kind].arrow ? '→' : '—'}</span>
              <button className="truncate hover:text-primary" onClick={() => onSelectNode(edge.to_id)}>{edgeTo?.label ?? '?'}</button>
            </div>

            {/* Kind */}
            <div>
              <label className={sectionLabel}>Link type</label>
              <div className="grid grid-cols-2 gap-1">
                {EDGE_KINDS.map((k) => (
                  <button
                    key={k}
                    className={`btn btn-xs justify-start ${edge.kind === k ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                    title={EDGE_KIND_META[k].hint}
                    onClick={() => edgeCallbacks.onFieldsChange(edge.id, { kind: k })}
                  >
                    {EDGE_KIND_META[k].icon} {EDGE_KIND_META[k].label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-base-content/40 mt-1">{EDGE_KIND_META[edge.kind].hint}</div>
            </div>

            {edge.kind === 'prereq' && (
              <div>
                <label className={sectionLabel}>Required rank in {edgeFrom?.label ?? 'source'}</label>
                <div className="flex items-center gap-2">
                  <NumberField
                    value={edge.min_rank}
                    min={1}
                    max={edgeFrom && isTalent(edgeFrom) ? edgeFrom.max_rank : 99}
                    onCommit={(min_rank) => edgeCallbacks.onFieldsChange(edge.id, { min_rank })}
                  />
                  {edgeFrom && isTalent(edgeFrom) && <span className="text-xs text-base-content/50">of {edgeFrom.max_rank}</span>}
                  <span className="flex-1" />
                  <button
                    className="btn btn-xs btn-ghost border border-base-300"
                    title="Swap which node is the prerequisite"
                    onClick={() => edgeCallbacks.onFieldsChange(edge.id, { from_id: edge.to_id, to_id: edge.from_id })}
                  >⇄ Reverse</button>
                </div>
              </div>
            )}

            {/* Label */}
            <div>
              <label className={sectionLabel}>Label</label>
              <input
                className="input input-sm input-bordered w-full"
                placeholder={edge.kind === 'prereq' ? 'Defaults to the required rank' : 'Optional'}
                value={edgeLabel}
                onChange={(e) => setEdgeLabel(e.target.value)}
                onBlur={() => edgeCallbacks.onLabelChange(edge.id, edgeLabel || null)}
                onKeyDown={(e) => { if (e.key === 'Enter') edgeCallbacks.onLabelChange(edge.id, edgeLabel || null) }}
              />
            </div>

            {/* Color */}
            <div>
              <label className={sectionLabel}>Color</label>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className={`w-6 h-6 rounded-full border-2 bg-base-300 ${!edge.color ? 'border-white' : 'border-transparent'}`}
                  title="Default for link type / inherit from nodes"
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
              <label className={sectionLabel}>Line style</label>
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
              <label className={sectionLabel}>Animation</label>
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
                🗑 Delete link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
