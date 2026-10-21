import { TALENT_TYPES, type CanvasEdge, type CanvasNode, type CanvasNodeType, type EdgeKind, type NodeRequirement, type NodeShape, type TalentType } from '@shared/types'

export function isTalentType(type: CanvasNodeType): type is TalentType {
  return (TALENT_TYPES as readonly string[]).includes(type)
}

export function isTalent(node: Pick<CanvasNode, 'type'>): boolean {
  return isTalentType(node.type)
}

/** Per-node result of evaluating the tree in preview mode (see rules.ts) */
export type NodeState = {
  rank: number
  state: 'locked' | 'available' | 'partial' | 'maxed'
  canAdd: boolean
  canRemove: boolean
  reasons: string[]   // why it's locked / can't take another rank
}

// ── Node types ───────────────────────────────────────────────────────────────

export const NODE_TYPE_META: Record<CanvasNodeType, { label: string; icon: string; shape: NodeShape; scale: number; hint: string }> = {
  skill:    { label: 'Skill',    icon: '⚡', shape: 'circle',        scale: 1,    hint: 'Active ability' },
  passive:  { label: 'Passive',  icon: '◈', shape: 'roundedSquare', scale: 1,    hint: 'Always-on bonus' },
  stat:     { label: 'Stat',     icon: '✚', shape: 'diamond',       scale: 0.85, hint: 'Small attribute boost' },
  keystone: { label: 'Keystone', icon: '★', shape: 'hexagon',       scale: 1.25, hint: 'Capstone / build-defining node' },
  note:     { label: 'Note',     icon: '📄', shape: 'rectangle',     scale: 1,    hint: 'Linked document card' },
  group:    { label: 'Group',    icon: '▣', shape: 'rectangle',     scale: 1,    hint: 'Container box' },
}

/** Type a new sub-node gets when created under `parent` */
export function childTypeFor(parent: Pick<CanvasNode, 'type'>): CanvasNodeType {
  if (parent.type === 'keystone') return 'skill'
  return parent.type === 'group' ? 'skill' : parent.type
}

// ── Link kinds ───────────────────────────────────────────────────────────────

export const EDGE_KIND_META: Record<EdgeKind, { label: string; icon: string; hint: string; dash?: string; arrow: boolean; width: number; color?: string }> = {
  prereq:    { label: 'Prerequisite', icon: '→', hint: 'Source must reach the minimum rank before the target can be taken', arrow: true,  width: 2 },
  exclusive: { label: 'Exclusive',    icon: '✕', hint: 'Only one of the two can be taken',                                  arrow: false, width: 2,   dash: '7 5', color: '#ef4444' },
  synergy:   { label: 'Synergy',      icon: '✦', hint: 'Work well together — informational, no rules',                      arrow: false, width: 2,   dash: '2 5' },
  related:   { label: 'Related',      icon: '—', hint: 'Plain connection — no rules',                                       arrow: false, width: 1.5 },
}

export const EDGE_KINDS = Object.keys(EDGE_KIND_META) as EdgeKind[]

/** Prereq links between talents carry rules; everything else is decoration */
export function isRuleEdge(e: Pick<CanvasEdge, 'kind'>): boolean {
  return e.kind === 'prereq' || e.kind === 'exclusive'
}

// ── Requirements ─────────────────────────────────────────────────────────────

export function parseRequirements(json: string | null | undefined): NodeRequirement[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((r) => r && typeof r === 'object' && typeof r.kind === 'string') : []
  } catch {
    return []
  }
}

export function serializeRequirements(reqs: NodeRequirement[]): string | null {
  return reqs.length ? JSON.stringify(reqs) : null
}

export function describeRequirement(r: NodeRequirement): string {
  switch (r.kind) {
    case 'points_spent': return `${r.min} points spent in ${r.scope === 'group' ? 'this group' : 'this tree'}`
    case 'level': return `Level ${r.min}`
    case 'custom': return r.text || '(note)'
  }
}

export function rankLabel(rank: number, max: number): string {
  return `${rank}/${max}`
}
