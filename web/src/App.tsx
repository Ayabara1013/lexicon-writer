import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { api } from './api'
import type { DocMeta } from './types'
import LoginPage from './components/LoginPage'
import NavRail from './components/NavRail'
import Sidebar from './components/Sidebar'
import Editor, { DEFAULT_FORMATTING } from './components/Editor'
import type { EditorFormatting } from './components/Editor'
import { DEFAULT_NORMAL_IDS, DEFAULT_FOCUS_IDS } from './toolbarItems'

type View = 'editor' | 'overview'

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<View>('editor')
  const [toolbarNormal, setToolbarNormal] = useState<string[]>(DEFAULT_NORMAL_IDS)
  const [toolbarFocus, setToolbarFocus] = useState<string[]>(DEFAULT_FOCUS_IDS)
  const [formatting, setFormatting] = useState<EditorFormatting>(DEFAULT_FORMATTING)

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load docs when logged in
  useEffect(() => {
    if (!userEmail) return
    api.docs.list()
      .then((rows) => { setDocs(rows); if (rows.length > 0) setActiveId(rows[0].id) })
      .catch(console.error)
    Promise.all([
      api.settings.get('toolbar_normal'),
      api.settings.get('toolbar_focus'),
      api.settings.get('editor_line_height'),
      api.settings.get('editor_first_line_indent'),
      api.settings.get('editor_indent_size'),
    ]).then(([n, f, lh, fli, is]) => {
      if (n) { try { setToolbarNormal(JSON.parse(n)) } catch {} }
      if (f) { try { setToolbarFocus(JSON.parse(f)) } catch {} }
      setFormatting({
        lineHeight: lh ?? DEFAULT_FORMATTING.lineHeight,
        firstLineIndent: fli ?? DEFAULT_FORMATTING.firstLineIndent,
        indentSize: is ?? DEFAULT_FORMATTING.indentSize,
      })
    })
  }, [userEmail])

  async function handleCreate(type: 'chapter' | 'note') {
    const doc = await api.docs.create(type === 'chapter' ? 'New Chapter' : 'New Note', type)
    setDocs((prev) => [...prev, doc])
    setActiveId(doc.id)
    setView('editor')
  }

  async function handleCreateSub(parentId: string) {
    const doc = await api.docs.create('New Chapter', 'chapter', parentId)
    setDocs((prev) => [...prev, doc])
    setActiveId(doc.id)
    setView('editor')
  }

  async function handleRename(id: string, title: string) {
    await api.docs.update(id, { title })
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)))
  }

  async function handleDelete(id: string) {
    await api.docs.delete(id)
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  async function handleReorder(orderedIds: string[]) {
    await Promise.all(orderedIds.map((id, i) => api.docs.update(id, { sort_order: i + 1 })))
    setDocs((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]))
      const reordered = orderedIds.map((id) => byId.get(id)!).filter(Boolean)
      const rest = prev.filter((d) => !orderedIds.includes(d.id))
      return [...reordered, ...rest]
    })
  }

  const handleOpenDoc = useCallback((id: string) => {
    setActiveId(id)
    setView('editor')
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setDocs([])
    setActiveId(null)
    setUserEmail(null)
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#13111e', color: '#55507a', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (!userEmail) return <LoginPage onLogin={setUserEmail} />

  const showSidebar = view === 'editor' || view === 'overview'

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#13111e', color: '#e8e5f5', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', fontSize: 13 }}>
      <NavRail
        activeView={view}
        onNavigate={(v) => setView(v)}
        userEmail={userEmail}
        onSignOut={handleSignOut}
      />

      {showSidebar && (
        <Sidebar
          docs={docs}
          activeId={activeId}
          onSelect={handleOpenDoc}
          onCreate={handleCreate}
          onCreateSub={handleCreateSub}
          onRename={handleRename}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeId ? (
          <Editor
            key={activeId}
            docId={activeId}
            enabledNormal={toolbarNormal}
            enabledFocus={toolbarFocus}
            formatting={formatting}
            docMeta={docs.find((d) => d.id === activeId) ?? null}
            onMetaUpdate={async (fields) => {
              await api.docs.update(activeId, fields)
              setDocs((prev) => prev.map((d) => d.id === activeId ? { ...d, ...fields } : d))
            }}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#55507a', fontSize: 13 }}>
            {docs.length === 0 ? 'Create a chapter to start writing' : 'Select a document to start writing'}
          </div>
        )}
      </main>
    </div>
  )
}
