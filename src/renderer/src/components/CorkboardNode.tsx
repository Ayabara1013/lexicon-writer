import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { DocMeta } from '../env'

export type DocNodeData = { doc: DocMeta; onOpen: (id: string) => void }
export type DocNode = Node<DocNodeData, 'doc'>

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function CorkboardNode({ data, selected }: NodeProps<DocNode>) {
  const { doc, onOpen } = data
  const isChapter = doc.type === 'chapter'

  return (
    <>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div
        onDoubleClick={() => onOpen(doc.id)}
        className={`
          w-56 rounded-lg border bg-base-200 shadow-lg cursor-grab active:cursor-grabbing
          transition-all duration-150 select-none
          ${isChapter
            ? 'border-primary/40 shadow-primary/10'
            : 'border-secondary/40 shadow-secondary/10'}
          ${selected ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-base-100' : ''}
        `}
      >
        {/* Header */}
        <div className={`px-3 py-2 rounded-t-lg border-b flex items-center gap-2 ${isChapter ? 'border-primary/20 bg-primary/10' : 'border-secondary/20 bg-secondary/10'}`}>
          <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded ${isChapter ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'}`}>
            {isChapter ? 'CHAPTER' : 'NOTE'}
          </span>
        </div>

        {/* Title */}
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-sm font-semibold text-base-content leading-snug line-clamp-2">
            {doc.title}
          </p>
        </div>

        {/* Footer */}
        <div className="px-3 pb-2.5 pt-1 flex items-center justify-between">
          <span className="text-[10px] text-base-content/30">
            {new Date(doc.updated_at).toLocaleDateString()}
          </span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpen(doc.id) }}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${isChapter ? 'text-primary/60 hover:text-primary hover:bg-primary/10' : 'text-secondary/60 hover:text-secondary hover:bg-secondary/10'}`}
          >
            Open →
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  )
}
