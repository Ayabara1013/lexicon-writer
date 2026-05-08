import { memo, useState } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'

type TalentNodeData = {
  label: string
  nodeType: 'skill' | 'note' | 'group'
  color: string
  isCore: boolean
  linkedDocId: string | null
  docPreview: string | null
  collapsed: boolean
  hiddenChildCount: number
  icon: string | null
  shape: 'circle' | 'diamond' | 'hexagon' | 'square' | 'rectangle' | 'roundedSquare'
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
  whiteSpace: 'nowrap',
  boxShadow: '0 4px 20px rgba(0,0,0,0.65)',
  minWidth: 100,
}

function NodeTooltip({ d }: { d: TalentNodeData }) {
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e5f5', marginBottom: 2 }}>{d.label}</div>
      <div style={{ fontSize: 10, color: d.color, textTransform: 'capitalize', letterSpacing: '0.04em' }}>{d.nodeType}</div>
      {d.linkedDocId && <div style={{ fontSize: 10, color: '#55507a', marginTop: 2 }}>→ linked document</div>}
    </div>
  )
}

function TalentNode({ data, selected }: NodeProps) {
  const d = data as TalentNodeData
  const selColor = d.color ?? '#ffffff'
  const ringStyle = selected
    ? { outline: `2px solid ${selColor}`, outlineOffset: 3, boxShadow: `0 0 16px ${selColor}55` }
    : {}
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

  if (d.nodeType === 'skill') {
    const isDiamond = d.shape === 'diamond'
    const isHex = d.shape === 'hexagon'
    const isSquare = d.shape === 'square'
    const isRect = d.shape === 'rectangle'
    const isRounded = d.shape === 'roundedSquare'

    if (isDiamond) {
      return (
        <>
          {allHandles}
          {hovered && <NodeTooltip d={d} />}
          <div
            className="relative flex items-center justify-center cursor-pointer select-none"
            style={{
              width: 80, height: 80,
              transform: 'rotate(45deg)',
              background: d.isCore
                ? 'radial-gradient(circle, #2a2740 60%, #1a1830)'
                : `${d.color}33`,
              border: `2px solid ${d.isCore ? '#4a4770' : d.color}`,
              boxShadow: selected
                ? `0 0 0 2px ${selColor}66`
                : d.isCore ? 'none' : `0 0 12px ${d.color}55`,
            }}
            onDoubleClick={d.onDoubleClick}
            {...hoverHandlers}
          >
            <div style={{ transform: 'rotate(-45deg)', textAlign: 'center' }}>
              {d.icon
                ? <div className="text-xl leading-none">{d.icon}</div>
                : <span className="text-[11px] font-semibold leading-tight text-white/90 max-w-[60px] block overflow-hidden line-clamp-2 px-1">{d.label}</span>
              }
            </div>
            {d.collapsed && d.hiddenChildCount > 0 && (
              <span
                className="absolute -bottom-2 -right-2 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
                style={{ transform: 'rotate(-45deg)', background: d.color, minWidth: 16, textAlign: 'center' }}
              >+{d.hiddenChildCount}</span>
            )}
          </div>
        </>
      )
    }

    if (isHex) {
      return (
        <>
          {allHandles}
          {hovered && <NodeTooltip d={d} />}
          <div
            className="relative flex items-center justify-center cursor-pointer select-none"
            style={{
              width: 80, height: 72,
              clipPath: hexClip,
              background: d.isCore
                ? 'radial-gradient(circle, #2a2740 60%, #1a1830)'
                : `${d.color}33`,
              boxShadow: selected ? `0 0 0 16px ${selColor}22` : d.isCore ? 'none' : `0 0 12px ${d.color}55`,
            }}
            onDoubleClick={d.onDoubleClick}
            {...hoverHandlers}
          >
            {/* Inner hex border */}
            <div style={{
              position: 'absolute', inset: 2, clipPath: hexClip,
              background: 'transparent',
              border: `2px solid ${d.isCore ? '#4a4770' : d.color}`,
            }}/>
            {d.icon
              ? <div className="text-xl leading-none relative z-10">{d.icon}</div>
              : <span className="text-[11px] font-semibold leading-tight text-white/90 max-w-[60px] text-center relative z-10 px-1 line-clamp-2">{d.label}</span>
            }
            {d.collapsed && d.hiddenChildCount > 0 && (
              <span
                className="absolute -bottom-2 -right-2 z-20 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
                style={{ background: d.color, minWidth: 16, textAlign: 'center' }}
              >+{d.hiddenChildCount}</span>
            )}
          </div>
        </>
      )
    }

    if (isSquare || isRect || isRounded) {
      const w = isRect ? 120 : 80
      const h = isRect ? 60 : 80
      const radius = isRounded ? 16 : isRect ? 6 : 0
      return (
        <>
          {allHandles}
          <div
            className="relative flex items-center justify-center cursor-pointer select-none"
            style={{
              width: w, height: h,
              borderRadius: radius,
              background: d.isCore
                ? 'radial-gradient(circle, #2a2740 60%, #1a1830)'
                : `${d.color}33`,
              border: `2px solid ${d.isCore ? '#4a4770' : d.color}`,
              boxShadow: selected
                ? `0 0 0 3px ${selColor}66, 0 0 16px ${selColor}44`
                : d.isCore ? 'none' : `0 0 12px ${d.color}55`,
            }}
            onDoubleClick={d.onDoubleClick}
            {...hoverHandlers}
          >
            {d.icon
              ? <div className="text-2xl leading-none">{d.icon}</div>
              : <span className="text-[11px] font-semibold text-center px-2 leading-tight text-white/90 overflow-hidden line-clamp-2">{d.label}</span>
            }
            {d.collapsed && d.hiddenChildCount > 0 && (
              <span
                className="absolute -bottom-2 -right-2 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
                style={{ background: d.color, minWidth: 16, textAlign: 'center' }}
              >+{d.hiddenChildCount}</span>
            )}
            {hovered && <NodeTooltip d={d} />}
          </div>
        </>
      )
    }

    // Default: circle
    return (
      <>
        {allHandles}
        <div
          className="relative flex flex-col items-center justify-center rounded-full w-20 h-20 cursor-pointer select-none"
          style={{
            background: d.isCore
              ? 'radial-gradient(circle, #2a2740 60%, #1a1830)'
              : `radial-gradient(circle, ${d.color}33 40%, ${d.color}11)`,
            border: `2px solid ${d.isCore ? '#4a4770' : d.color}`,
            boxShadow: selected
              ? `0 0 0 3px ${selColor}66, 0 0 16px ${selColor}44`
              : d.isCore ? 'none' : `0 0 12px ${d.color}55, inset 0 0 8px ${d.color}22`,
          }}
          onDoubleClick={d.onDoubleClick}
          {...hoverHandlers}
        >
          {d.icon
            ? <div className="text-2xl leading-none">{d.icon}</div>
            : <span className="text-xs text-center font-semibold px-1 leading-tight text-white/90 max-w-[72px] overflow-hidden line-clamp-2">{d.label}</span>
          }
          {d.collapsed && d.hiddenChildCount > 0 && (
            <span
              className="absolute -bottom-2 -right-2 text-[9px] font-bold px-1 py-0.5 rounded-full text-white"
              style={{ background: d.isCore ? '#4a4770' : d.color, minWidth: 16, textAlign: 'center' }}
            >+{d.hiddenChildCount}</span>
          )}
          {hovered && <NodeTooltip d={d} />}
        </div>
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
          boxShadow: selected
            ? `0 0 0 3px ${selColor}66, 0 0 12px ${selColor}44`
            : `0 0 8px ${d.color}44`,
          ...ringStyle,
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
