import { useEffect, useMemo, useRef } from 'react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { CanvasEdge, CanvasNode, NodePosition } from '@shared/types'
import { absolutePositions, resolveLayout, structuralLinks, GROUP_PAD, GROUP_PAD_TOP, type Size, type XY } from './layout'

type SimNode = SimulationNodeDatum & { id: string; w: number; h: number; group: string | null }
type SimLink = SimulationLinkDatum<SimNode> & { distance: number; strength: number }

type Options = {
  enabled: boolean
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  hidden: Set<string>
  size: (id: string) => Size
  /** Every frame while moving — positions in stored (group-relative) form */
  onTick: (positions: NodePosition[]) => void
  /** Once the simulation comes to rest (or is switched off) — persist these */
  onSettle: (positions: NodePosition[]) => void
}

/** Pulls group members toward their group's centre and pushes everything else out of the group's box */
function forceGroups() {
  let nodes: SimNode[] = []
  function force(alpha: number) {
    const boxes = new Map<string, { cx: number; cy: number; n: number; x0: number; y0: number; x1: number; y1: number }>()
    for (const d of nodes) {
      if (!d.group) continue
      const b = boxes.get(d.group) ?? { cx: 0, cy: 0, n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      b.cx += d.x!; b.cy += d.y!; b.n++
      b.x0 = Math.min(b.x0, d.x! - d.w / 2 - GROUP_PAD); b.x1 = Math.max(b.x1, d.x! + d.w / 2 + GROUP_PAD)
      b.y0 = Math.min(b.y0, d.y! - d.h / 2 - GROUP_PAD_TOP); b.y1 = Math.max(b.y1, d.y! + d.h / 2 + GROUP_PAD)
      boxes.set(d.group, b)
    }
    for (const d of nodes) {
      if (d.group) {
        const b = boxes.get(d.group)!
        d.vx! -= (d.x! - b.cx / b.n) * 0.08 * alpha
        d.vy! -= (d.y! - b.cy / b.n) * 0.08 * alpha
        continue
      }
      // Non-members inside a group's box get nudged out through the nearest side
      for (const b of boxes.values()) {
        const x0 = b.x0 - d.w / 2, x1 = b.x1 + d.w / 2, y0 = b.y0 - d.h / 2, y1 = b.y1 + d.h / 2
        if (d.x! <= x0 || d.x! >= x1 || d.y! <= y0 || d.y! >= y1) continue
        const push = [[d.x! - x0, -1, 0], [x1 - d.x!, 1, 0], [d.y! - y0, 0, -1], [y1 - d.y!, 0, 1]].sort((a, b2) => a[0] - b2[0])[0]
        d.vx! += push[1] * push[0] * 0.5 * alpha
        d.vy! += push[2] * push[0] * 0.5 * alpha
      }
    }
  }
  force.initialize = (ns: SimNode[]) => { nodes = ns }
  return force
}

/**
 * Obsidian-style live layout: nodes repel, links (esp. prerequisites and
 * parent → sub-node) pull together, nothing overlaps. Positions stream out via
 * onTick and are persisted once via onSettle when the simulation cools down.
 */
export function useForceLayout({ enabled, nodes, edges, hidden, size, onTick, onSettle }: Options) {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const latest = useRef({ nodes, size, onTick, onSettle })
  latest.current = { nodes, size, onTick, onSettle }
  const dirty = useRef(false)

  // Only structural changes rebuild the simulation — position writes (incl. our own) don't
  const structureKey = useMemo(() => {
    const ns = nodes.filter((n) => !hidden.has(n.id)).map((n) => `${n.id}:${n.type === 'group' ? 'g' : ''}${n.group_id ?? ''}:${n.parent_id ?? ''}`)
    const es = edges.filter((e) => !hidden.has(e.from_id) && !hidden.has(e.to_id)).map((e) => `${e.from_id}>${e.to_id}:${e.kind}`)
    return ns.sort().join('|') + '#' + es.sort().join('|')
  }, [nodes, edges, hidden])

  function snapshot(carryHidden: boolean): NodePosition[] {
    const sim = simRef.current
    if (!sim) return []
    const abs = new Map<string, XY>(sim.nodes().map((d) => [d.id, { x: d.x! - d.w / 2, y: d.y! - d.h / 2 }]))
    return resolveLayout(latest.current.nodes, abs, latest.current.size, { carryHidden })
  }

  function settle() {
    if (!dirty.current) return
    dirty.current = false
    latest.current.onSettle(snapshot(true))
  }

  useEffect(() => {
    if (!enabled) {
      if (simRef.current) { simRef.current.stop(); settle(); simRef.current = null }
      return
    }
    const all = latest.current.nodes
    const byId = new Map(all.map((n) => [n.id, n]))
    const abs = absolutePositions(all)
    const prev = new Map((simRef.current?.nodes() ?? []).map((d) => [d.id, d]))

    const simNodes: SimNode[] = all
      .filter((n) => n.type !== 'group' && !hidden.has(n.id))
      .map((n) => {
        const s = latest.current.size(n.id)
        const p = prev.get(n.id)
        const group = n.group_id && byId.has(n.group_id) ? n.group_id : null
        if (p) return Object.assign(p, { w: s.w, h: s.h, group })
        const a = abs.get(n.id)!
        return { id: n.id, w: s.w, h: s.h, group, x: a.x + s.w / 2, y: a.y + s.h / 2 }
      })
    const inSim = new Set(simNodes.map((d) => d.id))
    const simById = new Map(simNodes.map((d) => [d.id, d]))
    // A node that just appeared far from its parent (e.g. a subtree being expanded) starts next to it
    for (const d of simNodes) {
      if (prev.has(d.id) || !prev.size) continue
      const parent = byId.get(d.id)?.parent_id
      const p = parent ? simById.get(parent) : undefined
      if (p && Math.hypot(p.x! - d.x!, p.y! - d.y!) > 400) { d.x = p.x! + (Math.random() - 0.5) * 60; d.y = p.y! + 100 }
    }

    const seen = new Set<string>()
    const links: SimLink[] = []
    for (const [a, b] of structuralLinks(all, edges, (id) => inSim.has(id))) {
      seen.add(`${a}>${b}`); seen.add(`${b}>${a}`)
      links.push({ source: a, target: b, distance: 140, strength: 0.7 })
    }
    for (const e of edges) {
      if (!inSim.has(e.from_id) || !inSim.has(e.to_id) || seen.has(`${e.from_id}>${e.to_id}`)) continue
      seen.add(`${e.from_id}>${e.to_id}`); seen.add(`${e.to_id}>${e.from_id}`)
      links.push({ source: e.from_id, target: e.to_id, distance: 200, strength: 0.15 })
    }

    let sim = simRef.current
    if (sim) {
      sim.nodes(simNodes)
      ;(sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>).links(links)
      sim.alpha(Math.max(sim.alpha(), 0.3)).restart()
    } else {
      const cx = simNodes.reduce((s, d) => s + d.x!, 0) / (simNodes.length || 1)
      const cy = simNodes.reduce((s, d) => s + d.y!, 0) / (simNodes.length || 1)
      sim = forceSimulation<SimNode, SimLink>(simNodes)
        .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => l.distance).strength((l) => l.strength))
        .force('charge', forceManyBody<SimNode>().strength(-450).distanceMax(700))
        .force('collide', forceCollide<SimNode>((d) => Math.max(d.w, d.h) / 2 + 18).strength(0.9))
        .force('groups', forceGroups())
        .force('x', forceX<SimNode>(cx).strength(0.02))
        .force('y', forceY<SimNode>(cy).strength(0.02))
        .alpha(0.8)
      sim.on('tick', () => { dirty.current = true; latest.current.onTick(snapshot(false)) })
      sim.on('end', settle)
      simRef.current = sim
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, structureKey])

  // Persist on unmount (e.g. switching view / canvas while it's still moving)
  useEffect(() => () => { simRef.current?.stop(); settle(); simRef.current = null }, [])

  return {
    /** Hold nodes at absolute centre positions while the user drags them */
    pin(points: { id: string; x: number; y: number }[]) {
      const sim = simRef.current
      if (!sim) return
      const byId = new Map(sim.nodes().map((d) => [d.id, d]))
      for (const p of points) { const d = byId.get(p.id); if (d) { d.fx = p.x; d.fy = p.y } }
      sim.alphaTarget(0.25).restart()
    },
    /** Let dragged nodes go again (Obsidian behaviour: nothing stays pinned) */
    release(ids: string[]) {
      const sim = simRef.current
      if (!sim) return
      const set = new Set(ids)
      for (const d of sim.nodes()) if (set.has(d.id)) { d.fx = null; d.fy = null }
      sim.alphaTarget(0)
    },
    /** Stop without persisting — the caller is about to write its own positions (e.g. Tidy) */
    discard() { simRef.current?.stop(); simRef.current = null; dirty.current = false },
  }
}
