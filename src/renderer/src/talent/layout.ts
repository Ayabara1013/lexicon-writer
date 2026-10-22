import dagre from '@dagrejs/dagre'
import type { CanvasEdge, CanvasNode, NodePosition } from '@shared/types'

export type XY = { x: number; y: number }
export type Size = { w: number; h: number }
export type LayoutDirection = 'TB' | 'BT' | 'LR'

/** Space between a group's border and its members (top leaves room for the title tab) */
export const GROUP_PAD = 28
export const GROUP_PAD_TOP = 44

/** Absolute top-left of every node (group members are stored relative to their group) */
export function absolutePositions(nodes: CanvasNode[]): Map<string, XY> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, XY>()
  for (const n of nodes) {
    const g = n.group_id ? byId.get(n.group_id) : undefined
    out.set(n.id, g ? { x: g.pos_x + n.pos_x, y: g.pos_y + n.pos_y } : { x: n.pos_x, y: n.pos_y })
  }
  return out
}

/**
 * Turn absolute top-left positions for the laid-out nodes into stored positions:
 * - each group box is refitted around its laid-out members
 * - members become relative to their (new) group position
 * - with `carryHidden`, collapsed descendants move by the same delta as their nearest
 *   laid-out ancestor, so expanding a subtree later doesn't reveal it stranded far away
 */
export function resolveLayout(
  all: CanvasNode[],
  laidOut: Map<string, XY>,
  size: (id: string) => Size,
  { carryHidden = true }: { carryHidden?: boolean } = {},
): NodePosition[] {
  const byId = new Map(all.map((n) => [n.id, n]))
  const before = absolutePositions(all)
  const abs = new Map(laidOut)

  if (carryHidden) {
    for (const n of all) {
      if (abs.has(n.id) || n.type === 'group') continue
      let anc = n.parent_id ? byId.get(n.parent_id) : undefined
      const seen = new Set<string>()
      while (anc && !abs.has(anc.id) && !seen.has(anc.id)) { seen.add(anc.id); anc = anc.parent_id ? byId.get(anc.parent_id) : undefined }
      if (!anc || !abs.has(anc.id)) continue
      const a0 = before.get(anc.id)!, a1 = abs.get(anc.id)!, p = before.get(n.id)!
      abs.set(n.id, { x: p.x + a1.x - a0.x, y: p.y + a1.y - a0.y })
    }
  }

  // Fit groups around their members
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const g of all) {
    if (g.type !== 'group') continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of all) {
      if (n.group_id !== g.id || !laidOut.has(n.id)) continue
      const p = abs.get(n.id)!, s = size(n.id)
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + s.w); maxY = Math.max(maxY, p.y + s.h)
    }
    if (minX === Infinity) continue // empty (or fully collapsed) group stays where it is
    boxes.set(g.id, { x: minX - GROUP_PAD, y: minY - GROUP_PAD_TOP, w: maxX - minX + GROUP_PAD * 2, h: maxY - minY + GROUP_PAD + GROUP_PAD_TOP })
  }

  const out: NodePosition[] = []
  for (const [id, b] of boxes) out.push({ id, pos_x: b.x, pos_y: b.y, width: b.w, height: b.h })
  for (const [id, p] of abs) {
    const n = byId.get(id)
    if (!n || n.type === 'group') continue
    const g = n.group_id ? byId.get(n.group_id) : undefined
    const origin = g ? boxes.get(g.id) ?? { x: g.pos_x, y: g.pos_y } : { x: 0, y: 0 }
    out.push({ id, pos_x: p.x - origin.x, pos_y: p.y - origin.y })
  }
  return out
}

/** Links that shape a layout: prerequisites plus parent → sub-node relationships */
export function structuralLinks(nodes: CanvasNode[], edges: CanvasEdge[], include: (id: string) => boolean): [string, string][] {
  const seen = new Set<string>()
  const out: [string, string][] = []
  const add = (a: string, b: string) => {
    const key = `${a}>${b}`
    if (a === b || seen.has(key) || seen.has(`${b}>${a}`) || !include(a) || !include(b)) return
    seen.add(key); out.push([a, b])
  }
  for (const e of edges) if (e.kind === 'prereq') add(e.from_id, e.to_id)
  for (const n of nodes) if (n.parent_id) add(n.parent_id, n.id)
  return out
}

/**
 * One-shot layered "talent tree" layout (dagre): prerequisites flow in `direction`,
 * groups become clusters. Returns absolute top-left positions for `visible` nodes,
 * shifted so the tree stays roughly where it was on the canvas.
 */
export function treeLayout(all: CanvasNode[], edges: CanvasEdge[], visible: Set<string>, size: (id: string) => Size, direction: LayoutDirection): Map<string, XY> {
  const layoutNodes = all.filter((n) => n.type !== 'group' && visible.has(n.id))
  const groupIds = new Set(all.filter((n) => n.type === 'group').map((n) => n.id))
  const clustered = layoutNodes.some((n) => n.group_id && groupIds.has(n.group_id))

  const g = new dagre.graphlib.Graph({ compound: true })
  // Clusters make dagre insert border ranks between tiers (~3× the gap), so tighten it
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: clustered ? 30 : 90, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))

  const ids = new Set(layoutNodes.map((n) => n.id))
  for (const n of layoutNodes) {
    const s = size(n.id)
    // Extra room for rank pips under the node and the group title tab
    g.setNode(n.id, { width: s.w + 12, height: s.h + 18 })
  }
  for (const n of layoutNodes) {
    if (n.group_id && groupIds.has(n.group_id)) {
      if (!g.hasNode(n.group_id)) g.setNode(n.group_id, {})
      g.setParent(n.id, n.group_id)
    }
  }
  for (const [a, b] of structuralLinks(all, edges, (id) => ids.has(id))) g.setEdge(a, b)

  dagre.layout(g)

  const before = absolutePositions(all)
  const out = new Map<string, XY>()
  let oldMinX = Infinity, oldMinY = Infinity, newMinX = Infinity, newMinY = Infinity
  for (const n of layoutNodes) {
    const d = g.node(n.id), s = size(n.id)
    const p = { x: d.x - s.w / 2, y: d.y - s.h / 2 }
    out.set(n.id, p)
    const b = before.get(n.id)!
    oldMinX = Math.min(oldMinX, b.x); oldMinY = Math.min(oldMinY, b.y)
    newMinX = Math.min(newMinX, p.x); newMinY = Math.min(newMinY, p.y)
  }
  // Anchor the result at the old top-left so the tree doesn't jump across the canvas
  const dx = oldMinX - newMinX, dy = oldMinY - newMinY
  for (const p of out.values()) { p.x += dx; p.y += dy }
  return out
}

export function applyPositions(nodes: CanvasNode[], positions: NodePosition[]): CanvasNode[] {
  const byId = new Map(positions.map((p) => [p.id, p]))
  return nodes.map((n) => {
    const p = byId.get(n.id)
    if (!p) return n
    return { ...n, pos_x: p.pos_x, pos_y: p.pos_y, ...(p.width != null ? { width: p.width, height: p.height ?? n.height } : {}) }
  })
}
