import { useState } from 'react'
import type { DocMeta } from '../env'

type Props = {
  docs: DocMeta[]
  activeId: string | null
  generatorActive: boolean
  onSelect: (id: string) => void
  onOpenGenerator: () => void
  onCreate: (type: 'chapter' | 'note') => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export default function Sidebar({
  docs,
  activeId,
  generatorActive,
  onSelect,
  onOpenGenerator,
  onCreate,
  onRename,
  onDelete
}: Props) {
  const [tab, setTab] = useState<'chapter' | 'note'>('chapter')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const visible = docs.filter((d) => d.type === tab)

  function startRename(doc: DocMeta) {
    setRenamingId(doc.id)
    setRenameValue(doc.title)
  }

  function commitRename(id: string) {
    if (renameValue.trim()) onRename(id, renameValue.trim())
    setRenamingId(null)
  }

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-base-200 border-r border-base-300 h-full">
      <div className="p-4 border-b border-base-300">
        <h1 className="text-base-content font-semibold text-lg tracking-tight">Lexicon Writer</h1>
      </div>

      <div className="p-2 border-b border-base-300">
        <button
          onClick={onOpenGenerator}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            generatorActive
              ? 'bg-primary/20 text-primary'
              : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
          }`}
        >
          🎲 Character Generator
        </button>
      </div>

      <div className="flex border-b border-base-300">
        {(['chapter', 'note'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'text-primary border-b-2 border-primary'
                : 'text-base-content/50 hover:text-base-content'
            }`}
          >
            {t === 'chapter' ? 'Chapters' : 'Notes'}
          </button>
        ))}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visible.map((doc) => (
          <div key={doc.id} className="group relative">
            {renamingId === doc.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(doc.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                className="w-full px-3 py-2 rounded-lg text-sm bg-base-300 text-base-content outline-none"
              />
            ) : (
              <button
                onClick={() => onSelect(doc.id)}
                onDoubleClick={() => startRename(doc)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors pr-8 ${
                  activeId === doc.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                }`}
              >
                <span className="block truncate">{doc.title}</span>
              </button>
            )}

            <button
              onClick={() => onDelete(doc.id)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-error/20 hover:text-error text-base-content/40 transition-all text-xs"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}

        {visible.length === 0 && (
          <p className="text-xs text-base-content/30 px-3 py-4 text-center">
            No {tab === 'chapter' ? 'chapters' : 'notes'} yet
          </p>
        )}
      </nav>

      <div className="p-3 border-t border-base-300">
        <button
          onClick={() => onCreate(tab)}
          className="btn btn-sm btn-outline btn-primary w-full"
        >
          + New {tab === 'chapter' ? 'Chapter' : 'Note'}
        </button>
      </div>
    </aside>
  )
}
