import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ReactFlow, ReactFlowProvider, useReactFlow,
  Background, Controls, MiniMap, Panel,
  applyNodeChanges, applyEdgeChanges, ConnectionMode,
  type Node, type Edge, type OnConnect, type OnNodesChange,
  type OnEdgesChange, type NodeMouseHandler, type EdgeMouseHandler,
  type Connection, type FinalConnectionState, type OnNodeDrag, MarkerType,
  getNodesBounds, getViewportForBounds,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import type { Canvas, CanvasNode, CanvasEdge, CanvasNodeType, CanvasNodeFields, CanvasEdgeFields, NodePosition, NodeShape, DocMeta } from '../env'
import { applyPositions, resolveLayout, treeLayout, type LayoutDirection, type Size } from '../talent/layout'
import { useForceLayout } from '../talent/useForceLayout'
import { EDGE_KIND_META, EDGE_KINDS, NODE_TYPE_META, childTypeFor, describeRequirement, isTalent, parseRequirements, rankLabel } from '../talent/model'
import TalentNode from './TalentNode'
import FloatingEdge from './FloatingEdge'
import CanvasInspector from './CanvasInspector'

const GROUP_DEFAULT_W = 300
const GROUP_DEFAULT_H = 200

const EDGE_COLORS = [
  { label: 'Violet', value: '#7c6af7' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Cyan',   value: '#06b6d4' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Amber',  value: '#f59e0b' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Pink',   value: '#ec4899' },
  { label: 'White',  value: '#e8e5f5' },
]

const nodeTypes = { talent: TalentNode }
const edgeTypes = { floating: FloatingEdge }

type Snapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] }

// ── Color helpers ────────────────────────────────────────────────────────────

function resolveEdgeColor(from: CanvasNode, to: CanvasNode, edge: CanvasEdge, all: CanvasNode[]): string {
  if (edge.color) return edge.color
  const kindColor = EDGE_KIND_META[edge.kind]?.color
  if (kindColor) return kindColor
  if (to.color) return to.color
  if (from.color) return from.color
  let cur: CanvasNode | undefined = from
  while (cur?.parent_id) { const p = all.find((n) => n.id === cur!.parent_id); if (p?.color) return p.color; cur = p }
  return '#6b7280'
}

function resolveNodeColor(node: CanvasNode, all: CanvasNode[]): string {
  if (node.color) return node.color
  if (node.group_id) { const g = all.find((n) => n.id === node.group_id); if (g?.color) return g.color }
  let cur: CanvasNode | undefined = node
  while (cur?.parent_id) { const p = all.find((n) => n.id === cur!.parent_id); if (p?.color) return p.color; cur = p }
  return '#6b7280'
}

function getDescendants(nodeId: string, all: CanvasNode[]): Set<string> {
  const result = new Set<string>()
  const queue = [nodeId]
  while (queue.length) {
    const cur = queue.pop()!
    all.forEach((n) => { if (n.parent_id === cur && !result.has(n.id)) { result.add(n.id); queue.push(n.id) } })
  }
  return result
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// ── Context menu type ────────────────────────────────────────────────────────

type ContextMenu = { x: number; y: number; clientX: number; clientY: number; nodeId?: string; edgeId?: string }
type Props = { docs: DocMeta[]; onOpenDoc: (id: string) => void }

// ── Inner component (has access to ReactFlow context) ───────────────────────

function TalentCanvasInner({ docs, onOpenDoc }: Props) {
  const { screenToFlowPosition, fitView, getNodes, getEdges, getInternalNode } = useReactFlow()

  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [canvasId, setCanvasId] = useState<string | null>(null)
  const [renamingCanvas, setRenamingCanvas] = useState(false)
  const [canvasTitleDraft, setCanvasTitleDraft] = useState('')

  const [dbNodes, setDbNodes] = useState<CanvasNode[]>([])
  const [dbEdges, setDbEdges] = useState<CanvasEdge[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null)
  const [inspectorEdgeId, setInspectorEdgeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [docPreviews, setDocPreviews] = useState<Record<string, string>>({})

  // Layout: 'force' = live Obsidian-style physics; 'free' = manual positions
  const [layoutMode, setLayoutMode] = useState<'free' | 'force'>('free')
  const livePositions = useRef(new Map<string, NodePosition>())

  const flowRef = useRef<HTMLDivElement>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasTitleRef = useRef<HTMLInputElement>(null)

  // Undo/redo
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const dbNodesRef = useRef(dbNodes)
  const dbEdgesRef = useRef(dbEdges)
  const canvasIdRef = useRef(canvasId)
  useEffect(() => { dbNodesRef.current = dbNodes }, [dbNodes])
  useEffect(() => { dbEdgesRef.current = dbEdges }, [dbEdges])
  useEffect(() => { canvasIdRef.current = canvasId }, [canvasId])
  const pendingSelectRef = useRef<string | null>(null)
  const layoutModeRef = useRef(layoutMode)
  layoutModeRef.current = layoutMode
  const inspectorNodeIdRef = useRef(inspectorNodeId)
  useEffect(() => { inspectorNodeIdRef.current = inspectorNodeId }, [inspectorNodeId])

  // Stable resize handler — always reads latest state
  const onResizeEndRef = useRef<(id: string, w: number, h: number) => void>(() => {})
  onResizeEndRef.current = (id: string, w: number, h: number) => {
    window.api.canvas.updateNode(id, { width: w, height: h })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, width: w, height: h } : n))
  }

  function pushSnapshot() {
    undoStack.current.push({ nodes: [...dbNodesRef.current], edges: [...dbEdgesRef.current] })
    redoStack.current = []
    if (undoStack.current.length > 50) undoStack.current.shift()
  }

  async function applySnapshot(snap: Snapshot) {
    if (!canvasIdRef.current) return
    await window.api.canvas.restoreSnapshot(canvasIdRef.current, snap.nodes, snap.edges)
    setDbNodes(snap.nodes); setDbEdges(snap.edges)
  }

  function undo() { const s = undoStack.current.pop(); if (!s) return; redoStack.current.push({ nodes: [...dbNodesRef.current], edges: [...dbEdgesRef.current] }); applySnapshot(s) }
  function redo() { const s = redoStack.current.pop(); if (!s) return; undoStack.current.push({ nodes: [...dbNodesRef.current], edges: [...dbEdgesRef.current] }); applySnapshot(s) }

  // ── Load canvas list & default ──────────────────────────────────────────

  useEffect(() => {
    Promise.all([window.api.canvas.list(), window.api.canvas.getDefault()]).then(([list, defaultId]) => {
      setCanvases(list)
      setCanvasId(defaultId)
    })
  }, [])

  useEffect(() => {
    if (!canvasId) return
    undoStack.current = []; redoStack.current = []
    setInspectorNodeId(null); setInspectorEdgeId(null)
    Promise.all([window.api.canvas.listNodes(canvasId), window.api.canvas.listEdges(canvasId), window.api.settings.get(`canvas_layout:${canvasId}`)])
      .then(([n, e, mode]) => { setDbNodes(n); setDbEdges(e); setLayoutMode(mode === 'force' ? 'force' : 'free') })
  }, [canvasId])

  useEffect(() => {
    const linkedIds = [...new Set(dbNodes.filter((n) => n.type === 'note' && n.linked_doc_id).map((n) => n.linked_doc_id!))]
    const missing = linkedIds.filter((id) => !(id in docPreviews))
    if (missing.length === 0) return
    Promise.all(missing.map((id) => window.api.docs.get(id).then((d) => [id, d?.content ?? ''] as [string, string])))
      .then((pairs) => setDocPreviews((prev) => ({ ...prev, ...Object.fromEntries(pairs.map(([id, c]) => [id, stripHtml(c)])) })))
  }, [dbNodes])

  // ── Compute hidden nodes (collapsed subtrees) ──────────────────────────

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>()
    dbNodes.filter((n) => n.collapsed).forEach((n) => getDescendants(n.id, dbNodes).forEach((id) => hidden.add(id)))
    return hidden
  }, [dbNodes])

  const hiddenChildCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    dbNodes.filter((n) => n.collapsed).forEach((n) => { counts[n.id] = getDescendants(n.id, dbNodes).size })
    return counts
  }, [dbNodes])

  // ── DB → XYFlow conversion ─────────────────────────────────────────────

  const prereqLabels = useMemo(() => {
    const byId = new Map(dbNodes.map((n) => [n.id, n]))
    const out: Record<string, string[]> = {}
    for (const e of dbEdges) {
      if (e.kind !== 'prereq') continue
      const src = byId.get(e.from_id)
      if (!src) continue
      ;(out[e.to_id] ??= []).push(`${src.label} ${rankLabel(Math.min(e.min_rank, src.max_rank), src.max_rank)}`)
    }
    return out
  }, [dbNodes, dbEdges])

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return new Set(dbNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id))
  }, [searchQuery, dbNodes])

  useEffect(() => {
    const visible = dbNodes.filter((n) => !hiddenNodeIds.has(n.id))
    // Groups render first (behind all other nodes)
    const sorted = [...visible].sort((a, b) => {
      if (a.type === 'group' && b.type !== 'group') return -1
      if (a.type !== 'group' && b.type === 'group') return 1
      return 0
    })

    // Rebuilding from the DB would otherwise drop React Flow's selection on every edit
    const pending = pendingSelectRef.current
    pendingSelectRef.current = null
    setNodes((prev) => {
      const selected = pending ? new Set([pending]) : new Set(prev.filter((n) => n.selected).map((n) => n.id))
      return sorted.map((n) => {
        const color = resolveNodeColor(n, dbNodes)
        const dimmed = searchMatchIds !== null && !searchMatchIds.has(n.id)
        const live = livePositions.current.get(n.id)
        const base: Node = {
          id: n.id,
          type: 'talent',
          position: live ? { x: live.pos_x, y: live.pos_y } : { x: n.pos_x, y: n.pos_y },
          style: dimmed ? { opacity: 0.2 } : undefined,
          data: {
            label: n.label,
            nodeType: n.type,
            color,
            isCore: !n.color && !n.parent_id && !n.group_id,
            linkedDocId: n.linked_doc_id,
            docPreview: n.linked_doc_id ? (docPreviews[n.linked_doc_id] ?? null) : null,
            collapsed: !!n.collapsed,
            hiddenChildCount: hiddenChildCounts[n.id] ?? 0,
            icon: n.icon ?? null,
            shape: n.shape ?? 'circle',
            description: n.description,
            maxRank: n.max_rank ?? 1,
            pointCost: n.point_cost ?? 1,
            prereqs: prereqLabels[n.id] ?? [],
            requirements: parseRequirements(n.requirements).map(describeRequirement),
            preview: null,
            onDoubleClick: n.linked_doc_id ? () => onOpenDoc(n.linked_doc_id!) : undefined,
            onResizeEnd: n.type === 'group'
              ? (w: number, h: number) => onResizeEndRef.current(n.id, w, h)
              : undefined,
          },
        }

        if (n.type === 'group') {
          base.style = { width: live?.width ?? n.width ?? GROUP_DEFAULT_W, height: live?.height ?? n.height ?? GROUP_DEFAULT_H, opacity: dimmed ? 0.2 : 1 }
          base.zIndex = -1
        }

        if (n.group_id) {
          base.parentId = n.group_id
        }

        if (selected.has(n.id)) base.selected = true
        return base
      })
    })
  }, [dbNodes, hiddenNodeIds, hiddenChildCounts, docPreviews, onOpenDoc, searchMatchIds, prereqLabels])

  useEffect(() => {
    setEdges(dbEdges
      .filter((e) => !hiddenNodeIds.has(e.from_id) && !hiddenNodeIds.has(e.to_id))
      .map((e) => {
        const from = dbNodes.find((n) => n.id === e.from_id)
        const to = dbNodes.find((n) => n.id === e.to_id)
        const color = from && to ? resolveEdgeColor(from, to, e, dbNodes) : '#6b7280'
        const dimmed = searchMatchIds !== null && !searchMatchIds.has(e.from_id) && !searchMatchIds.has(e.to_id)
        const meta = EDGE_KIND_META[e.kind] ?? EDGE_KIND_META.related
        // Prereqs that need more than one rank show it, e.g. "3/5"
        const rankHint = e.kind === 'prereq' && from && isTalent(from) && e.min_rank > 1
          ? rankLabel(Math.min(e.min_rank, from.max_rank), from.max_rank)
          : undefined
        return {
          id: e.id, type: 'floating',
          source: e.from_id, target: e.to_id,
          animated: !!e.animated,
          style: {
            stroke: color, strokeWidth: meta.width, strokeDasharray: meta.dash,
            opacity: dimmed ? 0.15 : e.kind === 'related' ? 0.6 : 1,
          },
          markerEnd: meta.arrow ? { type: MarkerType.ArrowClosed, color } : undefined,
          data: { label: e.label ?? rankHint, edgeStyle: e.edge_style ?? 'straight' },
        }
      })
    )
  }, [dbEdges, dbNodes, hiddenNodeIds, searchMatchIds])

  // ── Auto-layout ────────────────────────────────────────────────────────

  const measure = useCallback((id: string): Size => {
    const m = getInternalNode(id)?.measured
    if (m?.width && m?.height) return { w: m.width, h: m.height }
    const n = dbNodesRef.current.find((x) => x.id === id)
    if (n?.type === 'note') return { w: 160, h: 72 }
    const s = Math.round(80 * (n ? NODE_TYPE_META[n.type].scale : 1))
    return { w: s, h: s }
  }, [getInternalNode])

  const force = useForceLayout({
    enabled: layoutMode === 'force',
    nodes: dbNodes,
    edges: dbEdges,
    hidden: hiddenNodeIds,
    size: measure,
    onTick: (positions) => {
      const byId = new Map(positions.map((p) => [p.id, p]))
      livePositions.current = byId
      setNodes((nds) => nds.map((n) => {
        const p = byId.get(n.id)
        if (!p || (p.pos_x === n.position.x && p.pos_y === n.position.y && p.width == null)) return n
        return {
          ...n,
          position: { x: p.pos_x, y: p.pos_y },
          style: p.width != null ? { ...n.style, width: p.width, height: p.height ?? undefined } : n.style,
        }
      }))
    },
    onSettle: (positions) => {
      if (!positions.length) return
      window.api.canvas.updatePositions(positions)
      setDbNodes((prev) => applyPositions(prev, positions))
    },
  })

  const forceRef = useRef(force)
  forceRef.current = force

  function setLayout(mode: 'free' | 'force') {
    if (mode === 'free') livePositions.current = new Map()
    setLayoutMode(mode)
    if (canvasId) window.api.settings.set(`canvas_layout:${canvasId}`, mode)
  }

  async function tidy(direction: LayoutDirection) {
    const visible = new Set(dbNodes.filter((n) => !hiddenNodeIds.has(n.id)).map((n) => n.id))
    if (!visible.size) return
    if (layoutMode === 'force') { force.discard(); setLayout('free') }
    livePositions.current = new Map()
    const positions = resolveLayout(dbNodes, treeLayout(dbNodes, dbEdges, visible, measure, direction), measure)
    pushSnapshot()
    await window.api.canvas.updatePositions(positions)
    setDbNodes((prev) => applyPositions(prev, positions))
    setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 60)
  }

  /** Absolute centres of the dragged nodes (a dragged group carries its members) */
  function dragPins(dragged: Node[]): { id: string; x: number; y: number }[] {
    const pins: { id: string; x: number; y: number }[] = []
    for (const node of dragged) {
      const abs = getInternalNode(node.id)?.internals.positionAbsolute
      if (!abs) continue
      if (dbNodesRef.current.find((n) => n.id === node.id)?.type === 'group') {
        for (const m of getNodes()) {
          if (m.parentId !== node.id) continue
          const s = measure(m.id)
          pins.push({ id: m.id, x: abs.x + m.position.x + s.w / 2, y: abs.y + m.position.y + s.h / 2 })
        }
      } else {
        const s = measure(node.id)
        pins.push({ id: node.id, x: abs.x + s.w / 2, y: abs.y + s.h / 2 })
      }
    }
    return pins
  }

  const onNodeDrag: OnNodeDrag = (_e, _node, dragged) => {
    if (layoutMode === 'force') force.pin(dragPins(dragged))
  }

  // ── XYFlow handlers ────────────────────────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), [])
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), [])

  const onNodeDragStop: OnNodeDrag = useCallback((_e, node, dragged) => {
    if (layoutModeRef.current === 'force') {
      const ids = dragged.flatMap((d) => [d.id, ...getNodes().filter((m) => m.parentId === d.id).map((m) => m.id)])
      forceRef.current.release(ids)
    }
    const dbNode = dbNodesRef.current.find((n) => n.id === node.id)
    if (!dbNode) return

    // Group nodes: just save position, don't check containment
    if (dbNode.type === 'group') {
      window.api.canvas.updateNode(node.id, { pos_x: node.position.x, pos_y: node.position.y })
      setDbNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, pos_x: node.position.x, pos_y: node.position.y } : n))
      return
    }

    // Node already inside a group — check if dragged out
    if (dbNode.group_id) {
      const group = dbNodesRef.current.find((n) => n.id === dbNode.group_id)
      const gw = group?.width ?? GROUP_DEFAULT_W
      const gh = group?.height ?? GROUP_DEFAULT_H
      const DRAG_OUT_THRESHOLD = 40
      const outsideGroup = node.position.x < -DRAG_OUT_THRESHOLD || node.position.y < -DRAG_OUT_THRESHOLD
        || node.position.x > gw + DRAG_OUT_THRESHOLD || node.position.y > gh + DRAG_OUT_THRESHOLD
      if (outsideGroup && group) {
        // Convert relative → absolute and remove from group
        const absX = group.pos_x + node.position.x
        const absY = group.pos_y + node.position.y
        window.api.canvas.updateNode(node.id, { group_id: null, pos_x: absX, pos_y: absY })
        setDbNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, group_id: null, pos_x: absX, pos_y: absY } : n))
        return
      }
      // Still inside — save relative position
      window.api.canvas.updateNode(node.id, { pos_x: node.position.x, pos_y: node.position.y })
      setDbNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, pos_x: node.position.x, pos_y: node.position.y } : n))
      return
    }

    // Node is free — check if dropped into a group
    const absX = node.position.x
    const absY = node.position.y
    const hitGroup = dbNodesRef.current
      .filter((n) => n.type === 'group' && n.id !== node.id)
      .find((g) => {
        const gw = g.width ?? GROUP_DEFAULT_W
        const gh = g.height ?? GROUP_DEFAULT_H
        return absX >= g.pos_x && absX <= g.pos_x + gw && absY >= g.pos_y && absY <= g.pos_y + gh
      })

    if (hitGroup) {
      const relX = absX - hitGroup.pos_x
      const relY = absY - hitGroup.pos_y
      window.api.canvas.updateNode(node.id, { group_id: hitGroup.id, pos_x: relX, pos_y: relY })
      setDbNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, group_id: hitGroup.id, pos_x: relX, pos_y: relY } : n))
      return
    }

    window.api.canvas.updateNode(node.id, { pos_x: absX, pos_y: absY })
    setDbNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, pos_x: absX, pos_y: absY } : n))
  }, [])

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    const from = dbNodes.find((n) => n.id === connection.source)
    const to = dbNodes.find((n) => n.id === connection.target)
    // Linking is not parenting — sub-nodes are created explicitly (drag to empty space / Tab)
    const kind = from && to && isTalent(from) && isTalent(to) ? 'prereq' : 'related'
    pushSnapshot()
    window.api.canvas.createEdge(connection.source, connection.target, null, kind).then((newEdge) => {
      setDbEdges((prev) => [...prev, newEdge])
    })
  }, [dbNodes])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || !canvasId) return
    const clientX = 'touches' in event ? event.touches[0]?.clientX : (event as MouseEvent).clientX
    const clientY = 'touches' in event ? event.touches[0]?.clientY : (event as MouseEvent).clientY
    if (clientX == null || clientY == null) return
    const pos = screenToFlowPosition({ x: clientX, y: clientY })
    const parent = dbNodesRef.current.find((n) => n.id === state.fromNode!.id)
    if (!parent || parent.type === 'group') return
    // Sub-node joins the parent's group, so convert to the group's relative space
    const group = parent.group_id ? dbNodesRef.current.find((n) => n.id === parent.group_id) : undefined
    addSubNode(parent.id, { x: pos.x - 40 - (group?.pos_x ?? 0), y: pos.y - 40 - (group?.pos_y ?? 0) })
  }, [canvasId, screenToFlowPosition])

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setInspectorNodeId(node.id); setInspectorEdgeId(null); closeMenu()
  }, [])

  const onEdgeClick: EdgeMouseHandler = useCallback((_e, edge) => {
    setInspectorEdgeId(edge.id); setInspectorNodeId(null); closeMenu()
  }, [])

  // ── Context menus ──────────────────────────────────────────────────────

  const buildMenu = useCallback((clientX: number, clientY: number, nodeId?: string, edgeId?: string): ContextMenu => {
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return { x: clientX - rect.left, y: clientY - rect.top, clientX, clientY, nodeId, edgeId }
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY)); setInspectorNodeId(null); setInspectorEdgeId(null) }, [buildMenu])
  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY, node.id)) }, [buildMenu])
  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY, undefined, edge.id)) }, [buildMenu])
  const closeMenu = useCallback(() => setContextMenu(null), [])

  // ── Node mutations ─────────────────────────────────────────────────────

  async function addNode(type: CanvasNodeType, color?: string, clientX?: number, clientY?: number) {
    if (!canvasId) return
    const cx = clientX ?? contextMenu?.clientX; const cy = clientY ?? contextMenu?.clientY
    if (cx == null || cy == null) return
    const pos = screenToFlowPosition({ x: cx, y: cy })
    pushSnapshot()
    const isGroup = type === 'group'
    const newNode = await window.api.canvas.createNode(canvasId, {
      label: isGroup ? 'New Group' : type === 'note' ? 'New Note' : 'New Node',
      type,
      pos_x: isGroup ? pos.x - GROUP_DEFAULT_W / 2 : pos.x,
      pos_y: isGroup ? pos.y - GROUP_DEFAULT_H / 2 : pos.y,
      shape: NODE_TYPE_META[type].shape,
      color,
      width: isGroup ? GROUP_DEFAULT_W : undefined,
      height: isGroup ? GROUP_DEFAULT_H : undefined,
    })
    setDbNodes((prev) => [...prev, newNode]); closeMenu()
    setEditingNodeId(newNode.id); setEditingLabel(newNode.label)
  }

  /** Create a child of `parentId` (sub-node) linked by a prereq, then start renaming it */
  async function addSubNode(parentId: string, at?: { x: number; y: number }) {
    const cid = canvasIdRef.current
    const all = dbNodesRef.current
    const parent = all.find((n) => n.id === parentId)
    if (!cid || !parent || parent.type === 'group') return
    const type = childTypeFor(parent)
    // Fan children out under the parent: centre, left, right, further left…
    const i = all.filter((n) => n.parent_id === parentId).length
    const dx = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1) * Math.ceil(i / 2) * 120
    pushSnapshot()
    const child = await window.api.canvas.createNode(cid, {
      label: type === 'note' ? 'New Note' : 'New Node',
      type,
      shape: NODE_TYPE_META[type].shape,
      pos_x: at?.x ?? parent.pos_x + dx,
      pos_y: at?.y ?? parent.pos_y + 150,
      parent_id: parent.id,
      group_id: parent.group_id,
    })
    const edge = await window.api.canvas.createEdge(parent.id, child.id, null, isTalent(parent) && isTalent(child) ? 'prereq' : 'related')
    setDbNodes((prev) => [...prev, child])
    setDbEdges((prev) => [...prev, edge])
    selectOnly(child.id)
    setEditingNodeId(child.id); setEditingLabel(child.label)
  }

  /** New node next to `nodeId` — under the same parent if it has one */
  async function addSiblingNode(nodeId: string) {
    const cid = canvasIdRef.current
    const node = dbNodesRef.current.find((n) => n.id === nodeId)
    if (!cid || !node || node.type === 'group') return
    if (node.parent_id && dbNodesRef.current.some((n) => n.id === node.parent_id)) return addSubNode(node.parent_id)
    pushSnapshot()
    const sib = await window.api.canvas.createNode(cid, {
      label: node.type === 'note' ? 'New Note' : 'New Node',
      type: node.type,
      shape: NODE_TYPE_META[node.type].shape,
      pos_x: node.pos_x + 140,
      pos_y: node.pos_y,
      group_id: node.group_id,
    })
    setDbNodes((prev) => [...prev, sib])
    selectOnly(sib.id)
    setEditingNodeId(sib.id); setEditingLabel(sib.label)
  }

  function selectOnly(id: string) {
    // A brand-new node isn't in React Flow yet — select it on the next DB → XYFlow rebuild
    if (!getNodes().some((n) => n.id === id)) pendingSelectRef.current = id
    setNodes((nds) => nds.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })))
    setInspectorNodeId(id); setInspectorEdgeId(null)
  }

  async function updateNodeFields(id: string, fields: CanvasNodeFields) {
    pushSnapshot()
    await window.api.canvas.updateNode(id, fields)
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...fields } : n))
  }

  async function updateEdgeFields(id: string, fields: CanvasEdgeFields) {
    pushSnapshot()
    await window.api.canvas.updateEdge(id, fields)
    setDbEdges((prev) => prev.map((e) => e.id === id ? { ...e, ...fields } : e))
  }

  async function deleteNodes(ids: string[], edgeIds: string[] = []) {
    if (!ids.length && !edgeIds.length) return
    pushSnapshot()
    const all = dbNodesRef.current
    const doomed = new Set(ids)
    // Members of a deleted group are released in place (relative → absolute position)
    const released = all
      .filter((n) => n.group_id && doomed.has(n.group_id) && !doomed.has(n.id))
      .map((n) => {
        const g = all.find((x) => x.id === n.group_id)!
        return { ...n, group_id: null, pos_x: g.pos_x + n.pos_x, pos_y: g.pos_y + n.pos_y }
      })
    await Promise.all([
      ...released.map((n) => window.api.canvas.updateNode(n.id, { group_id: null, pos_x: n.pos_x, pos_y: n.pos_y })),
      ...ids.map((id) => window.api.canvas.deleteNode(id)),
      ...edgeIds.map((id) => window.api.canvas.deleteEdge(id)),
    ])
    const releasedById = new Map(released.map((n) => [n.id, n]))
    const doomedEdges = new Set(edgeIds)
    setDbNodes((prev) => prev
      .filter((n) => !doomed.has(n.id))
      .map((n) => releasedById.get(n.id) ?? (n.parent_id && doomed.has(n.parent_id) ? { ...n, parent_id: null } : n)))
    setDbEdges((prev) => prev.filter((e) => !doomedEdges.has(e.id) && !doomed.has(e.from_id) && !doomed.has(e.to_id)))
    if (inspectorNodeId && doomed.has(inspectorNodeId)) setInspectorNodeId(null)
    if (inspectorEdgeId && doomedEdges.has(inspectorEdgeId)) setInspectorEdgeId(null)
    closeMenu()
  }

  const deleteNode = (id: string) => deleteNodes([id])

  async function setNodeColor(id: string, color: string | null) {
    pushSnapshot()
    await window.api.canvas.updateNode(id, { color })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, color } : n)); closeMenu()
  }

  async function setNodeType(id: string, type: CanvasNodeType) {
    const node = dbNodes.find((n) => n.id === id)
    if (!node) return
    const fields: CanvasNodeFields = { type }
    if (node.shape === NODE_TYPE_META[node.type].shape || !isTalent(node)) fields.shape = NODE_TYPE_META[type].shape
    await updateNodeFields(id, fields)
  }

  async function setNodeLinkedDoc(id: string, docId: string | null) {
    pushSnapshot()
    await window.api.canvas.updateNode(id, { linked_doc_id: docId })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, linked_doc_id: docId } : n))
  }

  async function toggleCollapse(id: string) {
    const node = dbNodes.find((n) => n.id === id)
    if (!node) return
    const next = node.collapsed ? 0 : 1
    pushSnapshot()
    await window.api.canvas.updateNode(id, { collapsed: next })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, collapsed: next } : n))
  }

  async function setNodeLabel(id: string, label: string) {
    pushSnapshot()
    await window.api.canvas.updateNode(id, { label })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, label } : n))
  }

  async function setNodeIcon(id: string, icon: string | null) {
    await window.api.canvas.updateNode(id, { icon })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, icon } : n))
  }

  async function setNodeShape(id: string, shape: NodeShape) {
    await window.api.canvas.updateNode(id, { shape })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, shape } : n))
  }

  async function removeFromGroup(id: string) {
    const node = dbNodes.find((n) => n.id === id)
    if (!node?.group_id) return
    const group = dbNodes.find((n) => n.id === node.group_id)
    const absX = (group?.pos_x ?? 0) + node.pos_x
    const absY = (group?.pos_y ?? 0) + node.pos_y
    pushSnapshot()
    await window.api.canvas.updateNode(id, { group_id: null, pos_x: absX, pos_y: absY })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, group_id: null, pos_x: absX, pos_y: absY } : n))
  }

  function startEditLabel(nodeId: string) {
    const node = dbNodes.find((n) => n.id === nodeId)
    if (!node) return
    setEditingNodeId(nodeId); setEditingLabel(node.label); closeMenu()
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function commitLabel() {
    if (!editingNodeId) return
    await setNodeLabel(editingNodeId, editingLabel)
    setEditingNodeId(null)
  }

  // ── Edge mutations ─────────────────────────────────────────────────────

  async function setEdgeColor(id: string, color: string | null) {
    pushSnapshot()
    await window.api.canvas.updateEdge(id, { color })
    setDbEdges((prev) => prev.map((e) => e.id === id ? { ...e, color } : e)); closeMenu()
  }

  async function setEdgeLabel(id: string, label: string | null) {
    pushSnapshot()
    await window.api.canvas.updateEdge(id, { label })
    setDbEdges((prev) => prev.map((e) => e.id === id ? { ...e, label } : e))
  }

  async function setEdgeAnimated(id: string, animated: boolean) {
    const val = animated ? 1 : 0
    await window.api.canvas.updateEdge(id, { animated: val })
    setDbEdges((prev) => prev.map((e) => e.id === id ? { ...e, animated: val } : e))
  }

  async function setEdgeStyle(id: string, style: string) {
    await window.api.canvas.updateEdge(id, { edge_style: style })
    setDbEdges((prev) => prev.map((e) => e.id === id ? { ...e, edge_style: style } : e))
  }

  async function deleteEdge(id: string) {
    pushSnapshot()
    await window.api.canvas.deleteEdge(id)
    setDbEdges((prev) => prev.filter((e) => e.id !== id))
    if (inspectorEdgeId === id) setInspectorEdgeId(null)
    closeMenu()
  }

  // ── Canvas management ──────────────────────────────────────────────────

  async function createCanvas() {
    const c = await window.api.canvas.create('Untitled Canvas')
    setCanvases((prev) => [...prev, c]); setCanvasId(c.id)
  }

  async function deleteCurrentCanvas() {
    if (!canvasId || canvases.length <= 1) return
    await window.api.canvas.delete(canvasId)
    const remaining = canvases.filter((c) => c.id !== canvasId)
    setCanvases(remaining); setCanvasId(remaining[0].id)
  }

  async function commitCanvasRename() {
    if (!canvasId || !canvasTitleDraft.trim()) { setRenamingCanvas(false); return }
    await window.api.canvas.rename(canvasId, canvasTitleDraft.trim())
    setCanvases((prev) => prev.map((c) => c.id === canvasId ? { ...c, title: canvasTitleDraft.trim() } : c))
    setRenamingCanvas(false)
  }

  async function exportPng() {
    const el = flowRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const allNodes = getNodes()
    if (!allNodes.length) return
    const bounds = getNodesBounds(allNodes)
    const PAD = 48
    const imgW = bounds.width + PAD * 2
    const imgH = bounds.height + PAD * 2
    const { x, y, zoom } = getViewportForBounds(bounds, imgW, imgH, 0.5, 2, PAD)
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#13111e',
        width: imgW, height: imgH,
        style: { width: String(imgW), height: String(imgH), transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: 'top left' },
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${currentCanvas?.title ?? 'canvas'}.png`
      a.click()
    } catch (err) {
      console.error('[canvas] export failed', err)
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === 'Escape') { closeMenu(); setEditingNodeId(null); setInspectorNodeId(null); setInspectorEdgeId(null); return }
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); return }
      if (e.key === 'f' || e.key === 'F') { fitView({ duration: 300 }); return }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = getNodes().filter((n) => n.selected)
        const target = sel.length === 1 ? sel[0].id : sel.length === 0 ? inspectorNodeIdRef.current : null
        if (!target) return
        e.preventDefault()
        if (e.key === 'Tab') addSubNode(target)
        else addSiblingNode(target)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteNodes(
          getNodes().filter((n) => n.selected).map((n) => n.id),
          getEdges().filter((ed) => ed.selected).map((ed) => ed.id),
        )
        return
      }
      if (e.key === 's' || e.key === 'S' || e.key === 'n' || e.key === 'N' || e.key === 'g' || e.key === 'G') {
        const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        if (e.key === 's' || e.key === 'S') addNode('skill', undefined, cx, cy)
        else if (e.key === 'n' || e.key === 'N') addNode('note', undefined, cx, cy)
        else addNode('group', undefined, cx, cy)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvasId, fitView, getNodes, getEdges, closeMenu])

  // ── Derived inspector objects ──────────────────────────────────────────

  const inspectorNode = inspectorNodeId ? dbNodes.find((n) => n.id === inspectorNodeId) ?? null : null
  const inspectorEdge = inspectorEdgeId ? dbEdges.find((e) => e.id === inspectorEdgeId) ?? null : null
  const currentCanvas = canvases.find((c) => c.id === canvasId)
  const contextNode = contextMenu?.nodeId ? dbNodes.find((n) => n.id === contextMenu.nodeId) : null
  const contextEdge = contextMenu?.edgeId ? dbEdges.find((e) => e.id === contextMenu.edgeId) : null

  return (
    <div className="relative w-full h-full bg-base-100 flex flex-col" ref={containerRef} onClick={closeMenu}>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-base-300 bg-base-200 z-10 shrink-0 overflow-hidden">
        {/* Canvas picker */}
        <div className="flex items-center gap-1 mr-2">
          <select
            className="select select-xs select-bordered max-w-36"
            value={canvasId ?? ''}
            onChange={(e) => setCanvasId(e.target.value)}
          >
            {canvases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {renamingCanvas ? (
            <input
              ref={canvasTitleRef}
              className="input input-xs input-bordered w-28"
              value={canvasTitleDraft}
              onChange={(e) => setCanvasTitleDraft(e.target.value)}
              onBlur={commitCanvasRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitCanvasRename(); if (e.key === 'Escape') setRenamingCanvas(false) }}
              autoFocus
            />
          ) : (
            <button className="btn btn-xs btn-ghost" title="Rename canvas" onClick={() => { setCanvasTitleDraft(currentCanvas?.title ?? ''); setRenamingCanvas(true); setTimeout(() => canvasTitleRef.current?.focus(), 30) }}>✏️</button>
          )}
          <button className="btn btn-xs btn-ghost" title="New canvas" onClick={createCanvas}>＋</button>
          {canvases.length > 1 && (
            <button className="btn btn-xs btn-ghost text-error" title="Delete canvas" onClick={deleteCurrentCanvas}>🗑</button>
          )}
        </div>

        <div className="w-px h-4 bg-base-300" />

        <button className="btn btn-xs btn-ghost" title="Undo (Ctrl+Z)" onClick={undo}>↩</button>
        <button className="btn btn-xs btn-ghost" title="Redo (Ctrl+Y)" onClick={redo}>↪</button>

        <div className="w-px h-4 bg-base-300" />

        <button className="btn btn-xs btn-ghost" title="Fit view (F)" onClick={() => fitView({ duration: 300 })}>⊡ Fit</button>
        <button className={`btn btn-xs ${snapToGrid ? 'btn-primary' : 'btn-ghost'}`} title="Snap to grid" onClick={() => setSnapToGrid((v) => !v)}># Snap</button>
        <button
          className={`btn btn-xs ${layoutMode === 'force' ? 'btn-primary' : 'btn-ghost'}`}
          title="Auto-arrange: nodes push apart and links pull together, like Obsidian's graph view"
          onClick={() => setLayout(layoutMode === 'force' ? 'free' : 'force')}
        >🧲 Auto-arrange</button>
        {/* Native select: a dropdown menu would be clipped by the toolbar's overflow-hidden */}
        <select
          className="select select-xs select-ghost w-auto font-semibold"
          title="Arrange once as a tiered tree (undoable)"
          value=""
          onChange={(e) => { const dir = e.target.value as LayoutDirection; e.target.blur(); if (dir) tidy(dir) }}
        >
          <option value="" disabled>⇵ Tidy</option>
          <option value="TB">↓ Top-down tree</option>
          <option value="BT">↑ Bottom-up tree</option>
          <option value="LR">→ Left-to-right</option>
        </select>

        <div className="w-px h-4 bg-base-300" />

        {/* Search */}
        <div className="relative">
          <input
            className="input input-xs input-bordered pl-6 w-32 focus:w-48 transition-all"
            placeholder="Search nodes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery('') }}
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30 text-[10px] pointer-events-none">⌕</span>
          {searchQuery && (
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/40 text-[10px]" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>

        <button className="btn btn-xs btn-ghost" title="Export PNG" onClick={exportPng}>↓ PNG</button>

        <div className="flex-1" />
        <span className="text-[10px] text-base-content/20 select-none pr-1 hidden lg:block">
          S · N · G = add · Tab = sub-node · Enter = sibling · F = fit · Del = delete · Ctrl+Z/Y
        </span>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden relative" ref={flowRef}>
        <ReactFlow
          nodes={nodes} edges={edges}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          snapToGrid={snapToGrid} snapGrid={[16, 16]}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDrag}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect} onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={() => { setInspectorNodeId(null); setInspectorEdgeId(null) }}
          fitView colorMode="dark" className="bg-base-100"
        >
          <Background color="#2a2740" gap={16} />
          <Panel position="top-left">
            <div className="bg-base-200/90 border border-base-300 rounded-md px-2 py-1.5 text-[10px] text-base-content/60 flex flex-col gap-1 select-none">
              {EDGE_KINDS.map((k) => {
                const m = EDGE_KIND_META[k]
                return (
                  <div key={k} className="flex items-center gap-1.5" title={m.hint}>
                    <svg width="22" height="6"><line x1="0" y1="3" x2={m.arrow ? 17 : 22} y2="3" stroke={m.color ?? '#9ca3af'} strokeWidth={m.width} strokeDasharray={m.dash} opacity={k === 'related' ? 0.6 : 1} />{m.arrow && <polygon points="16,0 22,3 16,6" fill="#9ca3af" />}</svg>
                    {m.label}
                  </div>
                )
              })}
            </div>
          </Panel>
          <Controls />
          <MiniMap nodeColor={(n) => (n.data?.color as string) ?? '#4a4770'} nodeStrokeColor={(n) => (n.data?.color as string) ?? '#6b7280'} nodeStrokeWidth={2} maskColor="#13111ecc" pannable zoomable />
        </ReactFlow>

        <CanvasInspector
          node={inspectorNode}
          edge={inspectorEdge}
          allNodes={dbNodes}
          allEdges={dbEdges}
          docs={docs}
          onSelectNode={selectOnly}
          onSelectEdge={(id) => { setInspectorEdgeId(id); setInspectorNodeId(null) }}
          onClose={() => { setInspectorNodeId(null); setInspectorEdgeId(null) }}
          nodeCallbacks={{
            onLabelChange: setNodeLabel,
            onColorChange: setNodeColor,
            onTypeChange: setNodeType,
            onIconChange: setNodeIcon,
            onShapeChange: setNodeShape,
            onLinkedDocChange: setNodeLinkedDoc,
            onCollapseToggle: toggleCollapse,
            onRemoveFromGroup: removeFromGroup,
            onFieldsChange: updateNodeFields,
            onDelete: deleteNode,
          }}
          edgeCallbacks={{
            onLabelChange: setEdgeLabel,
            onColorChange: setEdgeColor,
            onAnimatedToggle: setEdgeAnimated,
            onEdgeStyleChange: setEdgeStyle,
            onFieldsChange: updateEdgeFields,
            onDelete: deleteEdge,
          }}
        />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="absolute z-50 bg-base-200 border border-base-300 rounded-lg shadow-xl py-1 min-w-44"
          style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.edgeId ? (
            <>
              <div className="px-3 py-1 text-xs text-base-content/40 font-semibold uppercase tracking-wide">Line</div>
              <div className="px-3 py-1 text-xs text-base-content/40">Color</div>
              <div className="flex gap-1 px-3 pb-1.5">
                <button className="w-5 h-5 rounded-full border-2 border-base-content/20 bg-base-300" onClick={() => setEdgeColor(contextMenu.edgeId!, null)} />
                {EDGE_COLORS.map((c) => <button key={c.value} className="w-5 h-5 rounded-full border-2" title={c.label} style={{ background: c.value, borderColor: contextEdge?.color === c.value ? 'white' : 'transparent' }} onClick={() => setEdgeColor(contextMenu.edgeId!, c.value)} />)}
              </div>
              <div className="border-t border-base-300 mt-1" />
              <button className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-base-300" onClick={() => deleteEdge(contextMenu.edgeId!)}>🗑 Delete line</button>
            </>
          ) : contextMenu.nodeId ? (
            <>
              <div className="px-3 py-1 text-xs text-base-content/40 font-semibold uppercase tracking-wide">
                {dbNodes.find((n) => n.id === contextMenu.nodeId)?.type === 'group' ? 'Group' : 'Node'}
              </div>
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => startEditLabel(contextMenu.nodeId!)}>✏️ Rename</button>
              {contextNode && contextNode.type !== 'group' && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300 flex justify-between" onClick={() => { closeMenu(); addSubNode(contextMenu.nodeId!) }}>↳ Add sub-node <span className="text-base-content/30 text-xs">Tab</span></button>
                  <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300 flex justify-between" onClick={() => { closeMenu(); addSiblingNode(contextMenu.nodeId!) }}>⇥ Add sibling <span className="text-base-content/30 text-xs">Enter</span></button>
                </>
              )}
              {dbNodes.find((n) => n.id === contextMenu.nodeId)?.type !== 'group' && (
                <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => { toggleCollapse(contextMenu.nodeId!); closeMenu() }}>
                  {dbNodes.find((n) => n.id === contextMenu.nodeId)?.collapsed ? '▶ Expand' : '▼ Collapse'}
                </button>
              )}
              {dbNodes.find((n) => n.id === contextMenu.nodeId)?.group_id && (
                <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => { removeFromGroup(contextMenu.nodeId!); closeMenu() }}>
                  ⬖ Remove from group
                </button>
              )}
              <div className="px-3 py-1 text-xs text-base-content/40">Color</div>
              <div className="flex gap-1 px-3 pb-1.5">
                <button className="w-5 h-5 rounded-full border-2 border-base-content/20 bg-base-300" onClick={() => setNodeColor(contextMenu.nodeId!, null)} />
                {EDGE_COLORS.map((c) => <button key={c.value} className="w-5 h-5 rounded-full border-2" title={c.label} style={{ background: c.value, borderColor: contextNode?.color === c.value ? 'white' : 'transparent' }} onClick={() => setNodeColor(contextMenu.nodeId!, c.value)} />)}
              </div>
              <div className="border-t border-base-300 mt-1" />
              <button className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-base-300" onClick={() => deleteNode(contextMenu.nodeId!)}>🗑 Delete</button>
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-xs text-base-content/40 font-semibold uppercase tracking-wide">Add node</div>
              {(['skill', 'passive', 'stat', 'keystone', 'note', 'group'] as const).map((t) => (
                <button key={t} className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300 flex justify-between gap-3" title={NODE_TYPE_META[t].hint} onClick={() => addNode(t)}>
                  <span>{NODE_TYPE_META[t].icon} {NODE_TYPE_META[t].label}</span>
                  <span className="text-base-content/30 text-xs">{NODE_TYPE_META[t].hint}</span>
                </button>
              ))}
              <div className="px-3 py-1 text-xs text-base-content/40">Colored skill</div>
              <div className="flex gap-1 px-3 pb-2">
                {EDGE_COLORS.map((c) => <button key={c.value} className="w-5 h-5 rounded-full" title={`${c.label} skill`} style={{ background: c.value }} onClick={() => addNode('skill', c.value)} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Inline label editor */}
      {editingNodeId && (
        <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="pointer-events-auto bg-base-200 border border-primary rounded-lg p-3 shadow-xl">
            <input ref={inputRef} className="input input-sm input-bordered w-48" value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingNodeId(null) }}
              autoFocus />
            <div className="flex gap-2 mt-2 justify-end">
              <button className="btn btn-xs" onClick={() => setEditingNodeId(null)}>Cancel</button>
              <button className="btn btn-xs btn-primary" onClick={commitLabel}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TalentCanvas(props: Props) {
  return <ReactFlowProvider><TalentCanvasInner {...props} /></ReactFlowProvider>
}
