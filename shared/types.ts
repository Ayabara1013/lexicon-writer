export type DocMeta = {
  id: string
  title: string
  type: 'chapter' | 'note'
  created_at: number
  updated_at: number
  pos_x: number | null
  pos_y: number | null
  parent_id: string | null
  sort_order: number
  word_target: number | null
  pov: string | null
  location: string | null
  scene_status: string | null
  deleted_at: number | null
}

export type DocRow = DocMeta & { content: string }

// ── Canvas / talent tree ─────────────────────────────────────────────────────

export type Canvas = { id: string; title: string; created_at: number; updated_at?: number | null; deleted_at?: number | null }

export const TALENT_TYPES = ['skill', 'passive', 'stat', 'keystone'] as const
export type TalentType = typeof TALENT_TYPES[number]
export type CanvasNodeType = TalentType | 'note' | 'group'

export type NodeShape = 'circle' | 'diamond' | 'hexagon' | 'square' | 'rectangle' | 'roundedSquare'

/** Extra unlock conditions beyond prerequisite links. Stored as JSON in canvas_nodes.requirements. */
export type NodeRequirement =
  | { kind: 'points_spent'; scope: 'tree' | 'group'; min: number }
  | { kind: 'level'; min: number }
  | { kind: 'custom'; text: string }

export type CanvasNode = {
  id: string
  canvas_id: string
  label: string
  type: CanvasNodeType
  color: string | null
  linked_doc_id: string | null
  pos_x: number
  pos_y: number
  parent_id: string | null
  group_id: string | null
  collapsed: number  // 0 | 1
  icon: string | null
  shape: NodeShape
  width: number | null
  height: number | null
  description: string | null
  max_rank: number
  point_cost: number          // points per rank
  requirements: string | null // JSON NodeRequirement[]
  prereq_mode: 'all' | 'any'  // how multiple incoming prereq links combine
  deleted_at?: number | null
}

/**
 * prereq    — from must reach min_rank before to can be taken (directed)
 * exclusive — only one of the two can be taken
 * synergy   — informational, no rules
 * related   — plain line, no rules
 */
export type EdgeKind = 'prereq' | 'exclusive' | 'synergy' | 'related'

export type CanvasEdge = {
  id: string
  from_id: string
  to_id: string
  color: string | null
  label: string | null
  animated: number  // 0 | 1
  edge_style: string  // 'straight' | 'bezier' | 'step'
  kind: EdgeKind
  min_rank: number
  deleted_at?: number | null
}

export type CanvasNodeInit = {
  label: string
  type: CanvasNodeType
  pos_x: number
  pos_y: number
  color?: string | null
  linked_doc_id?: string | null
  parent_id?: string | null
  group_id?: string | null
  width?: number | null
  height?: number | null
  shape?: NodeShape
}

export type CanvasNodeFields = Partial<Omit<CanvasNode, 'id' | 'canvas_id' | 'deleted_at'>>
export type CanvasEdgeFields = Partial<Pick<CanvasEdge, 'from_id' | 'to_id' | 'color' | 'label' | 'animated' | 'edge_style' | 'kind' | 'min_rank'>>
export type NodePosition = { id: string; pos_x: number; pos_y: number; width?: number | null; height?: number | null }
