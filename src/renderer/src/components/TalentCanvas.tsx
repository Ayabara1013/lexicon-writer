import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ReactFlow, ReactFlowProvider, useReactFlow,
  Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, ConnectionMode,
  type Node, type Edge, type OnConnect, type OnNodesChange,
  type OnEdgesChange, type NodeMouseHandler, type EdgeMouseHandler,
  type Connection, type FinalConnectionState, MarkerType,
  getNodesBounds, getViewportForBounds,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import type { Canvas, CanvasNode, CanvasEdge, DocMeta } from '../env'
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

function resolveEdgeColor(from: CanvasNode, to: CanvasNode, explicit: string | null, all: CanvasNode[]): string {
  if (explicit) return explicit
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
  const { screenToFlowPosition, fitView, getNodes, getEdges } = useReactFlow()

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
    Promise.all([window.api.canvas.listNodes(canvasId), window.api.canvas.listEdges(canvasId)])
      .then(([n, e]) => { setDbNodes(n); setDbEdges(e) })
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

    setNodes(sorted.map((n) => {
      const color = resolveNodeColor(n, dbNodes)
      const dimmed = searchMatchIds !== null && !searchMatchIds.has(n.id)
      const base: Node = {
        id: n.id,
        type: 'talent',
        position: { x: n.pos_x, y: n.pos_y },
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
          shape: (n.shape ?? 'circle') as 'circle' | 'diamond' | 'hexagon' | 'square' | 'rectangle' | 'roundedSquare',
          onDoubleClick: n.linked_doc_id ? () => onOpenDoc(n.linked_doc_id!) : undefined,
          onResizeEnd: n.type === 'group'
            ? (w: number, h: number) => onResizeEndRef.current(n.id, w, h)
            : undefined,
        },
      }

      if (n.type === 'group') {
        base.style = { width: n.width ?? GROUP_DEFAULT_W, height: n.height ?? GROUP_DEFAULT_H, opacity: dimmed ? 0.2 : 1 }
        base.zIndex = -1
      }

      if (n.group_id) {
        base.parentId = n.group_id
      }

      return base
    }))
  }, [dbNodes, hiddenNodeIds, hiddenChildCounts, docPreviews, onOpenDoc, searchMatchIds])

  useEffect(() => {
    setEdges(dbEdges
      .filter((e) => !hiddenNodeIds.has(e.from_id) && !hiddenNodeIds.has(e.to_id))
      .map((e) => {
        const from = dbNodes.find((n) => n.id === e.from_id)
        const to = dbNodes.find((n) => n.id === e.to_id)
        const color = from && to ? resolveEdgeColor(from, to, e.color, dbNodes) : '#6b7280'
        const dimmed = searchMatchIds !== null && !searchMatchIds.has(e.from_id) && !searchMatchIds.has(e.to_id)
        return {
          id: e.id, type: 'floating',
          source: e.from_id, target: e.to_id,
          animated: !!e.animated,
          style: { stroke: color, strokeWidth: 2, opacity: dimmed ? 0.15 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          data: { label: e.label ?? undefined, edgeStyle: e.edge_style ?? 'straight' },
        }
      })
    )
  }, [dbEdges, dbNodes, hiddenNodeIds, searchMatchIds])

  // ── XYFlow handlers ────────────────────────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), [])
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), [])

  const onNodeDragStop: NodeMouseHandler = useCallback((_e, node) => {
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
    const edgeColor = to?.color ?? from?.color
    pushSnapshot()
    window.api.canvas.createEdge(connection.source, connection.target, edgeColor).then((newEdge) => {
      setDbEdges((prev) => [...prev, newEdge])
      window.api.canvas.updateNode(connection.target!, { parent_id: connection.source })
      setDbNodes((prev) => prev.map((n) => n.id === connection.target ? { ...n, parent_id: connection.source } : n))
    })
  }, [dbNodes])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || !canvasId) return
    const clientX = 'touches' in event ? event.touches[0]?.clientX : (event as MouseEvent).clientX
    const clientY = 'touches' in event ? event.touches[0]?.clientY : (event as MouseEvent).clientY
    if (clientX == null || clientY == null) return
    const pos = screenToFlowPosition({ x: clientX, y: clientY })
    const sourceId = state.fromNode.id
    const color = dbNodes.find((n) => n.id === sourceId)?.color ?? undefined
    pushSnapshot()
    window.api.canvas.createNode(canvasId, 'New Node', 'skill', pos.x - 40, pos.y - 40, color, undefined, sourceId)
      .then(async (newNode) => {
        setDbNodes((prev) => [...prev, newNode])
        const newEdge = await window.api.canvas.createEdge(sourceId, newNode.id, color)
        setDbEdges((prev) => [...prev, newEdge])
        setEditingNodeId(newNode.id); setEditingLabel(newNode.label)
      })
  }, [canvasId, dbNodes, screenToFlowPosition])

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

  const onPaneContextMenu = useCallback((e: React.MouseEvent) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY)); setInspectorNodeId(null); setInspectorEdgeId(null) }, [buildMenu])
  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY, node.id)) }, [buildMenu])
  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => { e.preventDefault(); setContextMenu(buildMenu(e.clientX, e.clientY, undefined, edge.id)) }, [buildMenu])
  const closeMenu = useCallback(() => setContextMenu(null), [])

  // ── Node mutations ─────────────────────────────────────────────────────

  async function addNode(type: 'skill' | 'note' | 'group', color?: string, clientX?: number, clientY?: number) {
    if (!canvasId) return
    const cx = clientX ?? contextMenu?.clientX; const cy = clientY ?? contextMenu?.clientY
    if (cx == null || cy == null) return
    const pos = screenToFlowPosition({ x: cx, y: cy })
    pushSnapshot()
    const isGroup = type === 'group'
    const newNode = await window.api.canvas.createNode(
      canvasId,
      isGroup ? 'New Group' : type === 'skill' ? 'New Node' : 'New Note',
      type,
      isGroup ? pos.x - GROUP_DEFAULT_W / 2 : pos.x,
      isGroup ? pos.y - GROUP_DEFAULT_H / 2 : pos.y,
      color,
      undefined, undefined,
      isGroup ? GROUP_DEFAULT_W : undefined,
      isGroup ? GROUP_DEFAULT_H : undefined,
    )
    setDbNodes((prev) => [...prev, newNode]); closeMenu()
    setEditingNodeId(newNode.id); setEditingLabel(newNode.label)
  }

  async function deleteNode(id: string) {
    pushSnapshot()
    // Unparent any children that are in this group before deleting
    const groupChildren = dbNodes.filter((n) => n.group_id === id)
    await Promise.all(groupChildren.map((n) => window.api.canvas.updateNode(n.id, { group_id: null })))
    setDbNodes((prev) => prev.map((n) => n.group_id === id ? { ...n, group_id: null } : n))

    await window.api.canvas.deleteNode(id)
    setDbNodes((prev) => prev.filter((n) => n.id !== id))
    setDbEdges((prev) => prev.filter((e) => e.from_id !== id && e.to_id !== id))
    if (inspectorNodeId === id) setInspectorNodeId(null)
    closeMenu()
  }

  async function setNodeColor(id: string, color: string | null) {
    pushSnapshot()
    await window.api.canvas.updateNode(id, { color })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, color } : n)); closeMenu()
  }

  async function setNodeType(id: string, type: 'skill' | 'note' | 'group') {
    pushSnapshot()
    await window.api.canvas.updateNode(id, { type })
    setDbNodes((prev) => prev.map((n) => n.id === id ? { ...n, type } : n))
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

  async function setNodeShape(id: string, shape: string) {
    await window.api.canvas.updateNode(id, { shape: shape as 'circle' | 'diamond' | 'hexagon' | 'square' | 'rectangle' | 'roundedSquare' })
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selNodes = getNodes().filter((n) => n.selected)
        const selEdges = getEdges().filter((ed) => ed.selected)
        if (!selNodes.length && !selEdges.length) return
        pushSnapshot()
        Promise.all([
          ...selNodes.map((n) => window.api.canvas.deleteNode(n.id)),
          ...selEdges.map((ed) => window.api.canvas.deleteEdge(ed.id)),
        ]).then(() => {
          const nids = new Set(selNodes.map((n) => n.id))
          const eids = new Set(selEdges.map((ed) => ed.id))
          setDbNodes((prev) => prev.filter((n) => !nids.has(n.id)))
          setDbEdges((prev) => prev.filter((ed) => !eids.has(ed.id) && !nids.has(ed.from_id) && !nids.has(ed.to_id)))
        })
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
          S · N · G = add node · F = fit · Del = delete · Ctrl+Z/Y = undo/redo
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
          <Controls />
          <MiniMap nodeColor={(n) => (n.data?.color as string) ?? '#4a4770'} nodeStrokeColor={(n) => (n.data?.color as string) ?? '#6b7280'} nodeStrokeWidth={2} maskColor="#13111ecc" pannable zoomable />
        </ReactFlow>

        <CanvasInspector
          node={inspectorNode}
          edge={inspectorEdge}
          docs={docs}
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
            onDelete: deleteNode,
          }}
          edgeCallbacks={{
            onLabelChange: setEdgeLabel,
            onColorChange: setEdgeColor,
            onAnimatedToggle: setEdgeAnimated,
            onEdgeStyleChange: setEdgeStyle,
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
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => addNode('skill')}>⚡ Skill node</button>
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => addNode('note')}>📄 Note node</button>
              <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-base-300" onClick={() => addNode('group')}>▣ Group</button>
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
