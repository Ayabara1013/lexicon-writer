import { describe, expect, it } from 'vitest'
import type { CanvasEdge, CanvasNode, EdgeKind, NodeRequirement } from '@shared/types'
import { allocate, evaluate, refund, validate, type Allocation, type Tree } from './rules'

function node(id: string, extra: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id, canvas_id: 'c', label: id, type: 'skill', color: null, linked_doc_id: null, pos_x: 0, pos_y: 0,
    parent_id: null, group_id: null, collapsed: 0, icon: null, shape: 'circle', width: null, height: null,
    description: null, max_rank: 1, point_cost: 1, requirements: null, prereq_mode: 'all', ...extra,
  }
}
function edge(from: string, to: string, kind: EdgeKind = 'prereq', min_rank = 1): CanvasEdge {
  return { id: `${from}-${to}`, from_id: from, to_id: to, color: null, label: null, animated: 0, edge_style: 'straight', kind, min_rank }
}
const reqs = (...r: NodeRequirement[]) => JSON.stringify(r)
const S = { budget: 20, level: 10 }

/** Allocate ranks one at a time, failing loudly if any step is refused */
function take(tree: Tree, ids: string[], settings = S): Allocation {
  let alloc: Allocation = {}
  for (const id of ids) {
    const r = allocate(tree, alloc, settings, id)
    if ('error' in r) throw new Error(`could not take ${id}: ${r.error}`)
    alloc = r.alloc
  }
  return alloc
}

describe('prerequisites', () => {
  const tree: Tree = {
    nodes: [node('fireball', { max_rank: 5 }), node('nova', { max_rank: 3 }), node('inferno')],
    edges: [edge('fireball', 'nova', 'prereq', 3), edge('nova', 'inferno')],
  }

  it('locks a node until its prereq reaches the required rank', () => {
    expect(evaluate(tree, {}, S).states.nova).toMatchObject({ state: 'locked', canAdd: false, reasons: ['Needs fireball 3/5'] })
    expect(evaluate(tree, { fireball: 2 }, S).states.nova.state).toBe('locked')
    expect(evaluate(tree, { fireball: 3 }, S).states.nova).toMatchObject({ state: 'available', canAdd: true, reasons: [] })
  })

  it('reports rank states', () => {
    const { states } = evaluate(tree, { fireball: 5, nova: 1 }, S)
    expect(states.fireball.state).toBe('maxed')
    expect(states.nova).toMatchObject({ state: 'partial', rank: 1 })
  })

  it('needs every prereq by default, any one with prereq_mode "any"', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const edges = [edge('a', 'c'), edge('b', 'c')]
    expect(evaluate({ nodes, edges }, { a: 1 }, S).states.c.state).toBe('locked')
    const anyTree = { nodes: [node('a'), node('b'), node('c', { prereq_mode: 'any' })], edges }
    expect(evaluate(anyTree, {}, S).states.c.reasons).toEqual(['Needs one of: a, b'])
    expect(evaluate(anyTree, { b: 1 }, S).states.c.state).toBe('available')
  })

  it('clamps a min rank above the source max to the max', () => {
    const t = { nodes: [node('a', { max_rank: 2 }), node('b')], edges: [edge('a', 'b', 'prereq', 5)] }
    expect(evaluate(t, { a: 2 }, S).states.b.state).toBe('available')
  })

  it('ignores links that touch notes or groups', () => {
    const t = { nodes: [node('n', { type: 'note' }), node('a')], edges: [edge('n', 'a')] }
    expect(evaluate(t, {}, S).states.a.state).toBe('available')
    expect(evaluate(t, {}, S).states.n).toBeUndefined()
  })
})

describe('allocation', () => {
  it('spends point_cost per rank and stops at the budget', () => {
    const t = { nodes: [node('a', { max_rank: 5, point_cost: 2 })], edges: [] }
    const alloc = take(t, ['a', 'a'], { budget: 5, level: 1 })
    const ev = evaluate(t, alloc, { budget: 5, level: 1 })
    expect(ev).toMatchObject({ spent: 4, remaining: 1 })
    expect(ev.states.a.reasons).toEqual(['Not enough points (needs 2, 1 left)'])
    expect(allocate(t, alloc, { budget: 5, level: 1 }, 'a')).toEqual({ error: 'Not enough points (needs 2, 1 left)' })
  })

  it('refuses past max rank', () => {
    const t = { nodes: [node('a', { max_rank: 2 })], edges: [] }
    expect(allocate(t, take(t, ['a', 'a']), S, 'a')).toEqual({ error: 'Already at max rank' })
  })

  it('exclusive links block the other side once one has points', () => {
    const t = { nodes: [node('fire'), node('ice')], edges: [edge('fire', 'ice', 'exclusive')] }
    const alloc = take(t, ['fire'])
    expect(allocate(t, alloc, S, 'ice')).toEqual({ error: 'Excluded by fire' })
  })

  it('checks character level', () => {
    const t = { nodes: [node('a', { requirements: reqs({ kind: 'level', min: 12 }) })], edges: [] }
    expect(evaluate(t, {}, { budget: 5, level: 11 }).states.a.reasons).toEqual(['Requires level 12'])
    expect(evaluate(t, {}, { budget: 5, level: 12 }).states.a.state).toBe('available')
  })

  it('does not enforce custom requirements', () => {
    const t = { nodes: [node('a', { requirements: reqs({ kind: 'custom', text: 'STR 20' }) })], edges: [] }
    expect(evaluate(t, {}, S).states.a.state).toBe('available')
  })
})

describe('points-spent requirements', () => {
  const tree: Tree = {
    nodes: [
      node('a', { max_rank: 5 }), node('b', { max_rank: 5, group_id: 'g' }),
      node('cap', { max_rank: 3, requirements: reqs({ kind: 'points_spent', scope: 'tree', min: 5 }) }),
      node('gcap', { group_id: 'g', requirements: reqs({ kind: 'points_spent', scope: 'group', min: 3 }) }),
    ],
    edges: [],
  }

  it('counts points spent elsewhere in the tree, not in the node itself', () => {
    expect(evaluate(tree, { a: 4 }, S).states.cap.reasons).toEqual(['Needs 5 points spent in the tree (4 so far)'])
    // cap's own rank must not top up its own requirement (4 + 1 would wrongly reach 5)
    expect(evaluate(tree, { a: 4, cap: 1 }, S).states.cap.reasons).toEqual(['Needs 5 points spent in the tree (4 so far)'])
    const alloc = take(tree, ['a', 'a', 'a', 'a', 'a', 'cap', 'cap'])
    expect(evaluate(tree, alloc, S).states.cap).toMatchObject({ rank: 2, canAdd: true })
  })

  it('group scope only counts nodes in the same group', () => {
    expect(evaluate(tree, { a: 5, b: 2 }, S).states.gcap.reasons).toEqual(['Needs 3 points spent in this group (2 so far)'])
    expect(evaluate(tree, { b: 3 }, S).states.gcap.state).toBe('available')
  })
})

describe('refunds', () => {
  const tree: Tree = {
    nodes: [node('a', { max_rank: 3 }), node('b'), node('c', { prereq_mode: 'any' }), node('d')],
    edges: [edge('a', 'b', 'prereq', 2), edge('a', 'c'), edge('d', 'c')],
  }

  it('blocks a refund that would break something already taken', () => {
    const alloc = take(tree, ['a', 'a', 'b'])
    expect(refund(tree, alloc, S, 'a')).toEqual({ error: 'b depends on it' })
  })

  it('allows it once the dependent is refunded first', () => {
    let alloc = take(tree, ['a', 'a', 'b'])
    const r1 = refund(tree, alloc, S, 'b')
    if ('error' in r1) throw new Error(r1.error)
    alloc = r1.alloc
    expect(refund(tree, alloc, S, 'a')).toEqual({ alloc: { a: 1 } })
  })

  it('allows it when an "any" node still has another prereq', () => {
    const alloc = take(tree, ['a', 'd', 'c'])
    expect('alloc' in refund(tree, alloc, S, 'a')).toBe(true)
  })

  it('blocks refunds that would drop a points-spent requirement below its minimum', () => {
    const t = { nodes: [node('a', { max_rank: 5 }), node('cap', { requirements: reqs({ kind: 'points_spent', scope: 'tree', min: 3 }) })], edges: [] }
    const alloc = take(t, ['a', 'a', 'a', 'cap'])
    expect(refund(t, alloc, S, 'a')).toEqual({ error: 'cap depends on it' })
  })

  it('is not blocked by conditions that were already broken (e.g. level lowered)', () => {
    const t = { nodes: [node('a'), node('lv', { requirements: reqs({ kind: 'level', min: 10 }) })], edges: [] }
    const alloc = take(t, ['a', 'lv'], { budget: 5, level: 10 })
    expect('alloc' in refund(t, alloc, { budget: 5, level: 1 }, 'a')).toBe(true)
  })

  it('refuses when there is nothing to refund', () => {
    expect(refund(tree, {}, S, 'a')).toEqual({ error: 'No points to refund' })
  })
})

describe('validate', () => {
  it('finds prerequisite loops', () => {
    const t = { nodes: [node('a'), node('b'), node('c')], edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')] }
    const msgs = validate(t).map((w) => w.message)
    expect(msgs).toContain('Prerequisite loop: a → b → c → a')
    expect(msgs.filter((m) => m.includes('can never'))).toEqual([])  // loop members aren't double-reported
  })

  it('finds nodes that can never be unlocked downstream of a loop or impossible requirement', () => {
    const t = {
      nodes: [node('a'), node('b'), node('after'), node('greedy', { requirements: reqs({ kind: 'points_spent', scope: 'tree', min: 50 }) })],
      edges: [edge('a', 'b'), edge('b', 'a'), edge('b', 'after')],
    }
    const msgs = validate(t).map((w) => w.message)
    expect(msgs).toContain('after can never be unlocked')
    expect(msgs).toContain('greedy can never be unlocked')
  })

  it('treats points-spent requirements as reachable when enough ranks exist', () => {
    const t = { nodes: [node('a', { max_rank: 5 }), node('cap', { requirements: reqs({ kind: 'points_spent', scope: 'tree', min: 5 }) })], edges: [] }
    expect(validate(t)).toEqual([])
  })

  it('flags impossible min ranks and requiring an exclusive partner', () => {
    const t = { nodes: [node('a', { max_rank: 2 }), node('b')], edges: [edge('a', 'b', 'prereq', 4), { ...edge('a', 'b', 'exclusive'), id: 'x' }] }
    const msgs = validate(t).map((w) => w.message)
    expect(msgs).toContain('b asks for a rank 4, but it only has 2')
    expect(msgs).toContain('b requires a but is exclusive with it')
  })

  it('is quiet for a healthy tree', () => {
    const t = { nodes: [node('a', { max_rank: 3 }), node('b'), node('c')], edges: [edge('a', 'b', 'prereq', 3), edge('b', 'c'), edge('a', 'c', 'synergy')] }
    expect(validate(t)).toEqual([])
  })
})
