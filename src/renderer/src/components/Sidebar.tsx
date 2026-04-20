import { useState } from 'react'

type DocItem = {
  id: string
  title: string
  type: 'chapter' | 'note'
}

const MOCK_DOCS: DocItem[] = [
  { id: '1', title: 'Chapter 1: The Beginning', type: 'chapter' },
  { id: '2', title: 'Chapter 2: Rising Tension', type: 'chapter' },
  { id: '3', title: 'Character: Mara', type: 'note' },
  { id: '4', title: 'World: The Ashfields', type: 'note' }
]

type Props = {
  activeId: string | null
  onSelect: (id: string) => void
}

export default function Sidebar({ activeId, onSelect }: Props) {
  const [tab, setTab] = useState<'chapters' | 'notes'>('chapters')

  const visible = MOCK_DOCS.filter((d) =>
    tab === 'chapters' ? d.type === 'chapter' : d.type === 'note'
  )

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-base-200 border-r border-base-300 h-full">
      <div className="p-4 border-b border-base-300">
        <h1 className="text-base-content font-semibold text-lg tracking-tight">Lexicon Writer</h1>
      </div>

      <div className="flex border-b border-base-300">
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'chapters' ? 'text-primary border-b-2 border-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('chapters')}
        >
          Chapters
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'notes' ? 'text-primary border-b-2 border-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visible.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              activeId === doc.id
                ? 'bg-primary/20 text-primary'
                : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
            }`}
          >
            {doc.title}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-base-300">
        <button className="btn btn-sm btn-outline btn-primary w-full">+ New Document</button>
      </div>
    </aside>
  )
}
