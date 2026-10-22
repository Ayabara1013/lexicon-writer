import { useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  BackgroundVariant,
  type NodeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DocMeta } from '../env'
import CorkboardNode, { type DocNode } from './CorkboardNode'

const nodeTypes = { doc: CorkboardNode }

const COLS = 4
const COL_GAP = 280
const ROW_GAP = 200
const OFFSET_X = 60
const OFFSET_Y = 60

type Props = {
  docs: DocMeta[]
  onOpenDoc: (id: string) => void
}

export default function Corkboard({ docs, onOpenDoc }: Props) {
  const initialNodes = useMemo<DocNode[]>(() =>
    docs.map((doc, i) => ({
      id: doc.id,
      type: 'doc' as const,
      position: {
        x: doc.pos_x ?? (i % COLS) * COL_GAP + OFFSET_X,
        y: doc.pos_y ?? Math.floor(i / COLS) * ROW_GAP + OFFSET_Y
      },
      data: { doc, onOpen: onOpenDoc }
    })),
    // intentionally only recompute on doc list identity change, not onOpenDoc
    [docs]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState([])

  // Keep nodes in sync when docs list changes (new/deleted docs)
  useEffect(() => {
    setNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id))
      const docIds = new Set(docs.map((d) => d.id))
      // Remove deleted
      const filtered = prev.filter((n) => docIds.has(n.id))
      // Add new
      const newDocs = docs.filter((d) => !existingIds.has(d.id))
      const added: DocNode[] = newDocs.map((doc, i) => ({
        id: doc.id,
        type: 'doc' as const,
        position: {
          x: doc.pos_x ?? ((filtered.length + i) % COLS) * COL_GAP + OFFSET_X,
          y: doc.pos_y ?? Math.floor((filtered.length + i) / COLS) * ROW_GAP + OFFSET_Y
        },
        data: { doc, onOpen: onOpenDoc }
      }))
      // Update data (title changes etc) for existing nodes
      const updated = filtered.map((n) => {
        const doc = docs.find((d) => d.id === n.id)
        if (!doc) return n
        return { ...n, data: { ...n.data, doc, onOpen: onOpenDoc } }
      })
      return [...updated, ...added]
    })
  }, [docs, onOpenDoc])

  const onNodeDragStop = useCallback<NodeMouseHandler>((_event, node) => {
    window.api.docs.updatePosition(node.id, node.position.x, node.position.y)
  }, [])

  return (
    <div className="w-full h-full bg-base-100">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#2a2535"
          gap={24}
          size={1.5}
        />
        <Controls
          className="!bg-base-200 !border-base-300 !shadow-lg"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  )
}
