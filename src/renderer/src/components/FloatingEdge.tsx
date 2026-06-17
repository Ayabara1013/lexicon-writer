import { memo } from 'react'
import { useInternalNode, getStraightPath, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

function rectIntersection(nx: number, ny: number, nw: number, nh: number, fx: number, fy: number) {
  const cx = nx + nw / 2, cy = ny + nh / 2
  const dx = fx - cx, dy = fy - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = Math.abs(dx) * (nh / 2) > Math.abs(dy) * (nw / 2)
    ? (nw / 2) / Math.abs(dx)
    : (nh / 2) / Math.abs(dy)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

function circleIntersection(nx: number, ny: number, r: number, fx: number, fy: number) {
  const cx = nx + r, cy = ny + r
  const dx = fx - cx, dy = fy - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return { x: cx, y: cy }
  return { x: cx + (dx / dist) * r, y: cy + (dy / dist) * r }
}

type EdgeData = { label?: string; edgeStyle?: 'straight' | 'bezier' | 'step' }

function FloatingEdge({
  id, source, target, style, markerEnd, data,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null

  const edgeStyle = (data as EdgeData | undefined)?.edgeStyle ?? 'straight'
  const label = (data as EdgeData | undefined)?.label

  let edgePath: string
  let labelX: number
  let labelY: number

  if (edgeStyle === 'bezier') {
    ;[edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  } else if (edgeStyle === 'step') {
    ;[edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 })
  } else {
    // straight: use node-surface intersection
    const sPos = sourceNode.internals.positionAbsolute
    const tPos = targetNode.internals.positionAbsolute
    const sW = sourceNode.measured?.width ?? 80
    const sH = sourceNode.measured?.height ?? 80
    const tW = targetNode.measured?.width ?? 80
    const tH = targetNode.measured?.height ?? 80
    const sCX = sPos.x + sW / 2, sCY = sPos.y + sH / 2
    const tCX = tPos.x + tW / 2, tCY = tPos.y + tH / 2
    const isCircle = (w: number, h: number) => w === h && w <= 84
    const sp = isCircle(sW, sH)
      ? circleIntersection(sPos.x, sPos.y, sW / 2, tCX, tCY)
      : rectIntersection(sPos.x, sPos.y, sW, sH, tCX, tCY)
    const tp = isCircle(tW, tH)
      ? circleIntersection(tPos.x, tPos.y, tW / 2, sCX, sCY)
      : rectIntersection(tPos.x, tPos.y, tW, tH, sCX, sCY)
    ;[edgePath, labelX, labelY] = getStraightPath({ sourceX: sp.x, sourceY: sp.y, targetX: tp.x, targetY: tp.y })
  }

  return (
    <>
      <path id={id} d={edgePath} fill="none" style={style} markerEnd={markerEnd as string} className="react-flow__edge-path" />
      {label ? (
        <foreignObject
          x={labelX - 40} y={labelY - 10}
          width={80} height={20}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(19,17,30,0.85)',
              border: `1px solid ${(style as React.CSSProperties | undefined)?.stroke ?? '#6b7280'}44`,
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 10,
              color: (style as React.CSSProperties | undefined)?.stroke ?? '#9ca3af',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              width: 'max-content',
              maxWidth: 120,
              transform: 'translateX(-50%)',
              marginLeft: '50%',
            }}
          >
            {label}
          </div>
        </foreignObject>
      ) : null}
    </>
  )
}

export default memo(FloatingEdge)
