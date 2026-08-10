import { useState, useEffect } from 'react'
import type { DocMeta } from './env'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import CharacterGenerator from './components/CharacterGenerator'

export default function App() {
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'editor' | 'generator'>('editor')

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api) { setError('window.api is undefined — preload not loaded'); return }
    window.api.docs.list()
      .then((rows) => { setDocs(rows); if (rows.length > 0) setActiveId(rows[0].id) })
      .catch((e) => setError(String(e)))
  }, [])

  async function handleCreate(type: 'chapter' | 'note') {
    const title = type === 'chapter' ? 'New Chapter' : 'New Note'
    const doc = await window.api.docs.create(title, type)
    setDocs((prev) => [...prev, doc])
    setActiveId(doc.id)
    setView('editor')
  }

  async function handleRename(id: string, title: string) {
    await window.api.docs.update(id, { title })
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)))
  }

  async function handleSaveGenerated(title: string, content: string) {
    const doc = await window.api.docs.create(title, 'note')
    await window.api.docs.update(doc.id, { content })
    setDocs((prev) => [...prev, doc])
  }

  async function handleDelete(id: string) {
    await window.api.docs.delete(id)
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  if (error) return (
    <div style={{ padding: 32, color: '#f87171', fontFamily: 'monospace', background: '#13111e', height: '100vh' }}>
      <strong>Startup error:</strong><br />{error}
    </div>
  )

  return (
    <div className="flex h-screen bg-base-100 text-base-content" data-theme="lexicon">
      <Sidebar
        docs={docs}
        activeId={view === 'editor' ? activeId : null}
        generatorActive={view === 'generator'}
        onSelect={(id) => { setActiveId(id); setView('editor') }}
        onOpenGenerator={() => setView('generator')}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <main className="flex-1 overflow-hidden">
        {view === 'generator' ? (
          <CharacterGenerator onSaveNote={handleSaveGenerated} />
        ) : activeId ? (
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
