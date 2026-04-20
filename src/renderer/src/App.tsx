import { useState, useEffect } from 'react'
import type { DocMeta } from './env'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'

export default function App() {
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    window.api.docs.list().then((rows) => {
      setDocs(rows)
      if (rows.length > 0) setActiveId(rows[0].id)
    })
  }, [])

  async function handleCreate(type: 'chapter' | 'note') {
    const title = type === 'chapter' ? 'New Chapter' : 'New Note'
    const doc = await window.api.docs.create(title, type)
    setDocs((prev) => [...prev, doc])
    setActiveId(doc.id)
  }

  async function handleRename(id: string, title: string) {
    await window.api.docs.update(id, { title })
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)))
  }

  async function handleDelete(id: string) {
    await window.api.docs.delete(id)
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  return (
    <div className="flex h-screen bg-base-100 text-base-content" data-theme="lexicon">
      <Sidebar
        docs={docs}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <main className="flex-1 overflow-hidden">
        {activeId ? (
          <Editor key={activeId} docId={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-base-content/30 text-sm">
            Select a document to start writing
          </div>
        )}
      </main>
    </div>
  )
}
