import { memo, useState } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import type { CanvasNodeType, NodeShape } from '../env'
import { NODE_TYPE_META, isTalentType, rankLabel, type NodeState } from '../talent/model'

export type TalentNodeData = {
  label: string
  nodeType: CanvasNodeType
  color: string
  isCore: boolean
  linkedDocId: string | null
  docPreview: string | null
  collapsed: boolean
  hiddenChildCount: number
  icon: string | null
  shape: NodeShape
  description: string | null
  maxRank: number
  pointCost: number
  prereqs: string[]        // "Fireball 3/5"
  requirements: string[]   // human-readable extra requirements
  preview: NodeState | null
  onDoubleClick?: () => void
  onResizeEnd?: (w: number, h: number) => void
}

const handleStyle = {
  width: 8, height: 8,
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.25)',
}

function CardinalHandles({ position, id }: { position: Position; id: string }) {
  return <Handle type="source" position={position} id={`${id}-src`} style={handleStyle} />
}

const allHandles = (
  <>
    <CardinalHandles position={Position.Top} id="top" />
    <CardinalHandles position={Position.Right} id="right" />
    <CardinalHandles position={Position.Bottom} id="bottom" />
    <CardinalHandles position={Position.Left} id="left" />
  </>
)

// Hexagon clip-path (flat-top)
const hexClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 10px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1a1825',
  border: '1px solid #2a2740',
  borderRadius: 8,
  padding: '7px 10px',
  zIndex: 100,
  pointerEvents: 'none',
  boxShadow: '0 4px 20px rgba(0,0,0,0.65)',
  minWidth: 120,
  maxWidth: 240,
  width: 'max-content',
}

function NodeTooltip({ d }: { d: TalentNodeData }) {
  const talent = isTalentType(d.nodeType)
  const reasons = d.preview?.reasons ?? []
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e5f5', marginBottom: 2 }}>{d.label}</div>
      <div style={{ fontSize: 10, color: d.color, letterSpacing: '0.04em' }}>
        {NODE_TYPE_META[d.nodeType].label}
        {talent && <span style={{ color: '#8b87a8' }}> · {d.maxRank} rank{d.maxRank === 1 ? '' : 's'} · {d.pointCost === 0 ? 'free' : `${d.pointCost} pt${d.pointCost === 1 ? '' : 's'}/rank`}</span>}
      </div>
      {d.description && <div style={{ fontSize: 11, color: '#c9c5e0', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.description}</div>}
      {talent && (d.prereqs.length > 0 || d.requirements.length > 0) && (
        <div style={{ fontSize: 10, color: '#8b87a8', marginTop: 4 }}>
          {d.prereqs.length > 0 && <div>Requires: {d.prereqs.join(', ')}</div>}
          {d.requirements.map((r, i) => <div key={i}>Requires: {r}</div>)}
        </div>
      )}
      {reasons.length > 0 && (
        <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>
          {reasons.map((r, i) => <div key={i}>✕ {r}</div>)}
        </div>
      )}
      {d.linkedDocId && <div style={{ fontSize: 10, color: '#55507a', marginTop: 2 }}>→ linked document</div>}
    </div>
  )
}

function CollapsedBadge({ d, rotate }: { d: TalentNodeData; rotate?: boolean }) {
  if (!d.collapsed || d.hiddenChildCount === 0) return null
  return (
    <span
      className="absolute -bottom-2 -right-2 z-20 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
      style={{ background: d.isCore ? '#4a4770' : d.color, minWidth: 16, textAlign: 'center', transform: rotate ? 'rotate(-45deg)' : undefined }}
    >+{d.hiddenChildCount}</span>
  )
}

/** Rank pips under the node (dots up to 6 ranks, then a "3/10" pill) */
function RankPips({ d }: { d: TalentNodeData }) {
  const rank = d.preview?.rank ?? 0
  if (d.maxRank <= 1 && !d.preview) return null
  const color = d.isCore ? '#8b87a8' : d.color
  return (
    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[3px] pointer-events-none" style={{ top: 'calc(100% + 5px)' }}>
      {d.maxRank <= 6
        ? Array.from({ length: d.maxRank }, (_, i) => (
            <span key={i} className="rounded-full" style={{
              width: 6, height: 6,
              background: i < rank ? color : 'transparent',
              border: `1px solid ${i < rank ? color : `${color}88`}`,
              boxShadow: i < rank ? `0 0 4px ${color}` : 'none',
            }} />
          ))
        : (
            <span className="text-[9px] font-bold px-1.5 rounded-full" style={{ color: rank > 0 ? '#fff' : color, background: rank > 0 ? `${color}aa` : `${color}22`, border: `1px solid ${color}66` }}>
              {rankLabel(rank, d.maxRank)}
            </span>
          )}
    </div>
  )
}

function CostBadge({ d }: { d: TalentNodeData }) {
  if (d.pointCost === 1) return null
  return (
    <span className="absolute -top-2 -right-2 z-20 text-[9px] font-bold px-1 rounded-full pointer-events-none"
      style={{ background: '#1a1825', color: d.isCore ? '#c9c5e0' : d.color, border: `1px solid ${d.isCore ? '#4a4770' : d.color}88` }}>
      {d.pointCost === 0 ? 'free' : `${d.pointCost}pt`}
    </span>
  )
}

/** Opacity / glow multipliers for preview mode */
function previewLook(d: TalentNodeData): { opacity: number; filter?: string; glow: number } {
  const p = d.preview
  if (!p) return { opacity: 1, glow: 1 }
  if (p.state === 'locked') return { opacity: 0.3, filter: 'grayscale(0.85)', glow: 0 }
  if (p.state === 'available') return { opacity: p.canAdd ? 0.95 : 0.55, glow: p.canAdd ? 0.6 : 0 }
  return { opacity: 1, glow: p.state === 'maxed' ? 2.2 : 1.6 }
}

function TalentShape({ d, selected, hoverHandlers }: { d: TalentNodeData; selected: boolean; hoverHandlers: object }) {
  const scale = NODE_TYPE_META[d.nodeType].scale
  const S = Math.round(80 * scale)
  const look = previewLook(d)
  const allocated = !!d.preview && d.preview.rank > 0
  const selColor = d.color ?? '#ffffff'
  const stroke = d.isCore && !allocated ? '#4a4770' : d.color
  const fill = d.isCore && !allocated
    ? 'radial-gradient(circle, #2a2740 60%, #1a1830)'
    : allocated
      ? `radial-gradient(circle, ${d.color}88 30%, ${d.color}33)`
      : `radial-gradient(circle, ${d.color}33 40%, ${d.color}11)`
  const glow = look.glow === 0 || (d.isCore && !allocated) ? 'none' : `0 0 ${Math.round(12 * look.glow)}px ${d.color}${look.glow > 1 ? 'aa' : '55'}`
  const keystoneRing = d.nodeType === 'keystone' ? `, 0 0 0 4px #13111e, 0 0 0 6px ${stroke}88` : ''
  const shadow = selected ? `0 0 0 3px ${selColor}66, 0 0 16px ${selColor}44` : `${glow}${keystoneRing}`.replace(/^none, /, '')
  const content = d.icon
    ? <div className="leading-none" style={{ fontSize: Math.round(22 * scale) }}>{d.icon}</div>
    : <span className="font-semibold text-center leading-tight text-white/90 overflow-hidden line-clamp-2 px-1" style={{ fontSize: d.nodeType === 'stat' ? 10 : 11, maxWidth: S - 8 }}>{d.label}</span>
  const wrapper: React.CSSProperties = { opacity: look.opacity, filter: look.filter, transition: 'opacity 150ms, filter 150ms' }

  if (d.shape === 'diamond') {
    const D = Math.round(S * 0.8)
    return (
      <div className="relative flex items-center justify-center" style={{ width: S, height: S, ...wrapper }} {...hoverHandlers}>
        <div
          className="absolute flex items-center justify-center cursor-pointer select-none"
          style={{ width: D, height: D, transform: 'rotate(45deg)', background: fill, border: `2px solid ${stroke}`, boxShadow: shadow }}
          onDoubleClick={d.onDoubleClick}
        >
          <div style={{ transform: 'rotate(-45deg)' }}>{content}</div>
        </div>
        <CollapsedBadge d={d} />
        <CostBadge d={d} />
        <RankPips d={d} />
      </div>
    )
  }

  if (d.shape === 'hexagon') {
    const H = Math.round(S * 0.9)
    // clip-path swallows box-shadow, so hexagons glow via drop-shadow instead
    const hexGlow = selected
      ? `drop-shadow(0 0 8px ${selColor})`
      : glow === 'none' ? '' : `drop-shadow(0 0 ${Math.round(6 * look.glow)}px ${d.color}88)`
    return (
      <div className="relative" style={{ width: S, height: H, ...wrapper, filter: [look.filter, hexGlow].filter(Boolean).join(' ') || undefined }} {...hoverHandlers}>
        <div className="absolute inset-0" style={{ clipPath: hexClip, background: stroke }} />
        <div
          className="absolute flex items-center justify-center cursor-pointer select-none"
          style={{ inset: d.nodeType === 'keystone' ? 3 : 2, clipPath: hexClip, background: '#13111e' }}
          onDoubleClick={d.onDoubleClick}
        >
          <div className="absolute inset-0" style={{ background: fill }} />
          <div className="relative z-10">{content}</div>
        </div>
        <CollapsedBadge d={d} />
        <CostBadge d={d} />
        <RankPips d={d} />
      </div>
    )
  }

  const isRect = d.shape === 'rectangle'
  const w = isRect ? Math.round(S * 1.5) : S
  const h = isRect ? Math.round(S * 0.75) : S
  const radius = d.shape === 'circle' ? '50%' : d.shape === 'roundedSquare' ? 16 * scale : isRect ? 6 : 0
  return (
    <div className="relative" style={{ width: w, height: h, ...wrapper }} {...hoverHandlers}>
      <div
        className="w-full h-full flex items-center justify-center cursor-pointer select-none"
        style={{ borderRadius: radius, background: fill, border: `2px solid ${stroke}`, boxShadow: shadow }}
        onDoubleClick={d.onDoubleClick}
      >
        {content}
      </div>
      <CollapsedBadge d={d} />
      <CostBadge d={d} />
      <RankPips d={d} />
    </div>
  )
}

function TalentNode({ data, selected }: NodeProps) {
  const d = data as TalentNodeData
  const selColor = d.color ?? '#ffffff'
  const [hovered, setHovered] = useState(false)
  const hoverHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  if (d.nodeType === 'group') {
    return (
      <>
        <NodeResizer
          minWidth={120} minHeight={80}
          isVisible={selected}
          lineStyle={{ borderColor: d.color, opacity: 0.8 }}
          handleStyle={{ width: 8, height: 8, background: d.color, border: 'none', borderRadius: 2 }}
          onResizeEnd={(_e, params) => d.onResizeEnd?.(params.width, params.height)}
        />
        {allHandles}
        {hovered && <NodeTooltip d={d} />}
        <div
          className="w-full h-full rounded-lg pointer-events-none"
          style={{
            border: `2px solid ${d.color}`,
            background: `${d.color}0d`,
            boxShadow: selected
              ? `0 0 0 2px ${d.color}66, inset 0 0 40px ${d.color}08`
              : `inset 0 0 40px ${d.color}08`,
          }}
          {...hoverHandlers}
        >
          <div
            className="absolute top-0 left-0 px-2 py-0.5 rounded-tl-md rounded-br-md text-[11px] font-semibold tracking-wide pointer-events-auto"
            style={{
              background: `${d.color}22`, color: d.color,
              borderBottom: `1px solid ${d.color}33`, borderRight: `1px solid ${d.color}33`,
            }}
          >
            {d.icon && <span className="mr-1">{d.icon}</span>}
            {d.label}
          </div>
        </div>
      </>
    )
  }

  if (isTalentType(d.nodeType)) {
    return (
      <>
        {allHandles}
        {hovered && <NodeTooltip d={d} />}
        <TalentShape d={d} selected={!!selected} hoverHandlers={hoverHandlers} />
      </>
    )
  }

  // Note node
  return (
    <>
      {allHandles}
      <div
        className="relative rounded-lg px-3 py-2 cursor-pointer select-none min-w-32 max-w-44"
        style={{
          background: '#1e1c2e',
          border: `2px solid ${d.color}`,
          opacity: d.preview ? 0.5 : 1,
          boxShadow: selected
            ? `0 0 0 3px ${selColor}66, 0 0 12px ${selColor}44`
            : `0 0 8px ${d.color}44`,
        }}
        onDoubleClick={d.onDoubleClick}
        {...hoverHandlers}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: d.color }}>
          {d.icon ? `${d.icon} ` : ''}Note
        </div>
        <div className="text-xs text-white/90 font-medium leading-tight truncate">{d.label}</div>
        <div className="text-[10px] text-base-content/30 mt-0.5 leading-tight line-clamp-2">
          {d.docPreview ?? '…'}
        </div>
        {d.collapsed && d.hiddenChildCount > 0 && (
          <span
            className="absolute -top-2 -right-2 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
            style={{ background: d.color, minWidth: 16, textAlign: 'center' }}
          >+{d.hiddenChildCount}</span>
        )}
        {hovered && <NodeTooltip d={d} />}
      </div>
    </>
  )
}

export default memo(TalentNode)
