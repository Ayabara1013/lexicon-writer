import type { CanvasEdge, CanvasNode, NodeRequirement } from '@shared/types'
import { isTalent, parseRequirements, rankLabel, type NodeState } from './model'

/**
 * Talent-tree rules: given the tree and how many ranks are allocated where,
 * decide what can be taken, what's locked and why. Pure — no React, no IPC.
 *
 * - prereq link A → B: B needs A at rank ≥ min_rank (clamped to A's max). With
 *   several prereqs, prereq_mode 'all' needs every one, 'any' needs one.
 * - exclusive link: only one side can have ranks.
 * - requirements: points spent elsewhere in the tree / group, character level.
 *   'custom' requirements are notes for the author and aren't enforced.
 * - each rank costs point_cost from the budget.
 */

export type Tree = { nodes: CanvasNode[]; edges: CanvasEdge[] }
export type Allocation = Record<string, number>
export type PreviewSettings = { budget: number; level: number }
export type TreeWarning = { message: string; nodeId?: string; edgeId?: string }

type Index = {
  talents: Map<string, CanvasNode>
  prereqs: Map<string, CanvasEdge[]>      // incoming prereq links per node
  exclusive: Map<string, string[]>        // exclusive partners per node
  requirements: Map<string, NodeRequirement[]>
}

function index({ nodes, edges }: Tree): Index {
  const talents = new Map(nodes.filter(isTalent).map((n) => [n.id, n]))
  const prereqs = new Map<string, CanvasEdge[]>()
  const exclusive = new Map<string, string[]>()
  for (const e of edges) {
    if (e.from_id === e.to_id || !talents.has(e.from_id) || !talents.has(e.to_id)) continue
    if (e.kind === 'prereq') {
      const list = prereqs.get(e.to_id) ?? []
      list.push(e)
      prereqs.set(e.to_id, list)
    } else if (e.kind === 'exclusive') {
      exclusive.set(e.from_id, [...(exclusive.get(e.from_id) ?? []), e.to_id])
      exclusive.set(e.to_id, [...(exclusive.get(e.to_id) ?? []), e.from_id])
    }
  }
  const requirements = new Map([...talents.values()].map((n) => [n.id, parseRequirements(n.requirements)]))
  return { talents, prereqs, exclusive, requirements }
}

const rankOf = (idx: Index, alloc: Allocation, id: string) => {
  const n = idx.talents.get(id)
  return n ? Math.max(0, Math.min(n.max_rank, alloc[id] ?? 0)) : 0
}

const requiredRank = (idx: Index, e: CanvasEdge) => Math.max(1, Math.min(e.min_rank, idx.talents.get(e.from_id)!.max_rank))

/** Points spent in the whole tree and per group (cost × rank) */
function spending(idx: Index, alloc: Allocation) {
  let total = 0
  const byGroup = new Map<string, number>()
  for (const n of idx.talents.values()) {
    const pts = rankOf(idx, alloc, n.id) * n.point_cost
    total += pts
    if (n.group_id) byGroup.set(n.group_id, (byGroup.get(n.group_id) ?? 0) + pts)
  }
  return { total, byGroup }
}

/** Everything (other than budget and max rank) stopping `id` from taking a rank */
function unmet(idx: Index, alloc: Allocation, settings: PreviewSettings, spent: ReturnType<typeof spending>, id: string): string[] {
  const node = idx.talents.get(id)!
  const out: string[] = []

  const links = idx.prereqs.get(id) ?? []
  const missing = links.filter((e) => rankOf(idx, alloc, e.from_id) < requiredRank(idx, e))
  const describe = (e: CanvasEdge) => {
    const src = idx.talents.get(e.from_id)!
    return src.max_rank > 1 ? `${src.label} ${rankLabel(requiredRank(idx, e), src.max_rank)}` : src.label
  }
  if (node.prereq_mode === 'any' && links.length > 1) {
    if (missing.length === links.length) out.push(`Needs one of: ${links.map(describe).join(', ')}`)
  } else {
    for (const e of missing) out.push(`Needs ${describe(e)}`)
  }

  for (const other of idx.exclusive.get(id) ?? []) {
    if (rankOf(idx, alloc, other) > 0) out.push(`Excluded by ${idx.talents.get(other)!.label}`)
  }

  // Points spent "elsewhere" — a node's own ranks never count towards its own requirement
  const own = rankOf(idx, alloc, id) * node.point_cost
  for (const r of idx.requirements.get(id) ?? []) {
    if (r.kind === 'level' && settings.level < r.min) out.push(`Requires level ${r.min}`)
    if (r.kind === 'points_spent') {
      const inGroup = r.scope === 'group' && node.group_id
      const have = (inGroup ? spent.byGroup.get(node.group_id!) ?? 0 : spent.total) - own
      if (have < r.min) out.push(`Needs ${r.min} points spent in ${inGroup ? 'this group' : 'the tree'} (${have} so far)`)
    }
  }
  return out
}

export function evaluate(tree: Tree, alloc: Allocation, settings: PreviewSettings): { states: Record<string, NodeState>; spent: number; remaining: number } {
  const idx = index(tree)
  const spent = spending(idx, alloc)
  const remaining = settings.budget - spent.total
  const states: Record<string, NodeState> = {}
  for (const n of idx.talents.values()) {
    const rank = rankOf(idx, alloc, n.id)
    const blockers = unmet(idx, alloc, settings, spent, n.id)
    const maxed = rank >= n.max_rank
    const affordable = remaining >= n.point_cost
    states[n.id] = {
      rank,
      state: maxed ? 'maxed' : rank > 0 ? 'partial' : blockers.length ? 'locked' : 'available',
      canAdd: !maxed && !blockers.length && affordable,
      // An allocated node can end up with blockers if the level / budget was lowered afterwards
      reasons: maxed && !blockers.length ? [] : blockers.length ? blockers : affordable ? [] : [`Not enough points (needs ${n.point_cost}, ${remaining} left)`],
    }
  }
  return { states, spent: spent.total, remaining }
}

/** One more rank in `id`, or the reason it can't be taken */
export function allocate(tree: Tree, alloc: Allocation, settings: PreviewSettings, id: string): { alloc: Allocation } | { error: string } {
  const st = evaluate(tree, alloc, settings).states[id]
  if (!st) return { error: 'Only talent nodes take points' }
  if (st.state === 'maxed') return { error: 'Already at max rank' }
  if (!st.canAdd) return { error: st.reasons[0] ?? 'Locked' }
  return { alloc: { ...alloc, [id]: st.rank + 1 } }
}

/** One rank less in `id`, unless something already taken depends on it */
export function refund(tree: Tree, alloc: Allocation, settings: PreviewSettings, id: string): { alloc: Allocation } | { error: string } {
  const idx = index(tree)
  const rank = rankOf(idx, alloc, id)
  if (rank === 0) return { error: 'No points to refund' }
  const next = { ...alloc, [id]: rank - 1 }
  if (next[id] === 0) delete next[id]
  const before = spending(idx, alloc), after = spending(idx, next)
  // Only block on conditions this refund newly breaks (others may already be broken by a lower level)
  for (const n of idx.talents.values()) {
    if (rankOf(idx, next, n.id) === 0) continue
    if (unmet(idx, alloc, settings, before, n.id).length === 0 && unmet(idx, next, settings, after, n.id).length > 0) {
      return { error: n.id === id ? `${n.label} would lose its own requirement` : `${n.label} depends on it` }
    }
  }
  return { alloc: next }
}

/** Authoring problems: prerequisite loops, impossible rank requirements, nodes that can never be taken */
export function validate(tree: Tree): TreeWarning[] {
  const idx = index(tree)
  const out: TreeWarning[] = []

  for (const list of idx.prereqs.values()) {
    for (const e of list) {
      const src = idx.talents.get(e.from_id)!
      if (e.min_rank > src.max_rank) {
        out.push({ edgeId: e.id, nodeId: e.to_id, message: `${idx.talents.get(e.to_id)!.label} asks for ${src.label} rank ${e.min_rank}, but it only has ${src.max_rank}` })
      }
    }
  }

  // Prerequisite loops (DFS over prereq links)
  const outgoing = new Map<string, string[]>()
  for (const e of [...idx.prereqs.values()].flat()) outgoing.set(e.from_id, [...(outgoing.get(e.from_id) ?? []), e.to_id])
  const state = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const inCycle = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1); stack.push(id)
    for (const to of outgoing.get(id) ?? []) {
      const s = state.get(to) ?? 0
      if (s === 1) {
        const loop = stack.slice(stack.indexOf(to))
        loop.forEach((x) => inCycle.add(x))
        out.push({ nodeId: to, message: `Prerequisite loop: ${[...loop, to].map((x) => idx.talents.get(x)!.label).join(' → ')}` })
      } else if (s === 0) visit(to)
    }
    stack.pop(); state.set(id, 2)
  }
  for (const id of idx.talents.keys()) if (!state.get(id)) visit(id)

  // Fixpoint with unlimited points and level: what could ever be unlocked?
  const unlockable = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    const maxed: Allocation = Object.fromEntries([...unlockable].map((id) => [id, idx.talents.get(id)!.max_rank]))
    const spent = spending(idx, maxed)
    for (const id of idx.talents.keys()) {
      if (unlockable.has(id)) continue
      const blockers = unmet(idx, maxed, { budget: Infinity, level: Infinity }, spent, id)
        .filter((b) => !b.startsWith('Excluded by'))
      if (!blockers.length) { unlockable.add(id); changed = true }
    }
  }
  for (const n of idx.talents.values()) {
    if (unlockable.has(n.id) || inCycle.has(n.id)) continue
    out.push({ nodeId: n.id, message: `${n.label} can never be unlocked` })
  }

  // Requiring something you're exclusive with
  for (const [id, partners] of idx.exclusive) {
    for (const p of partners) {
      if ((idx.prereqs.get(id) ?? []).some((e) => e.from_id === p) && idx.talents.get(id)!.prereq_mode !== 'any') {
        out.push({ nodeId: id, message: `${idx.talents.get(id)!.label} requires ${idx.talents.get(p)!.label} but is exclusive with it` })
      }
    }
  }
  return out
}
