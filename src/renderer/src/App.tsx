import { useState, useEffect, useCallback, useRef } from 'react'
import type { DocMeta } from './env'
import NavRail from './components/NavRail'
import Sidebar from './components/Sidebar'
import Editor, { DEFAULT_FORMATTING, DEFAULT_TYPOGRAPHY } from './components/Editor'
import type { EditorFormatting, TypographySettings } from './components/Editor'
import Corkboard from './components/Corkboard'
import GitPanel from './components/GitPanel'
import TalentCanvas from './components/TalentCanvas'
import OverviewView from './components/OverviewView'
import StatsView from './components/StatsView'
import TimelineView from './components/TimelineView'
import SettingsView from './components/SettingsView'
import { DEFAULT_NORMAL_IDS, DEFAULT_FOCUS_IDS } from './toolbarItems'

export type View = 'editor' | 'overview' | 'corkboard' | 'canvas' | 'timeline' | 'stats' | 'history' | 'settings'

export default function App() {
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<View>('editor')
  const [error, setError] = useState<string | null>(null)
  const [toolbarNormal, setToolbarNormal] = useState<string[]>(DEFAULT_NORMAL_IDS)
  const [toolbarFocus, setToolbarFocus] = useState<string[]>(DEFAULT_FOCUS_IDS)
  const [formatting, setFormatting] = useState<EditorFormatting>(DEFAULT_FORMATTING)
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY)
  const [typographyVersion, setTypographyVersion] = useState(0)

  const navHistory = useRef<Array<{ view: View; activeId: string | null }>>([])
  const currentNav = useRef({ view: 'editor' as View, activeId: null as string | null })

  function pushNav() {
    navHistory.current = [...navHistory.current.slice(-30), { ...currentNav.current }]
  }

  function navigateTo(newView: View, newActiveId?: string | null) {
    pushNav()
    currentNav.current = { view: newView, activeId: newActiveId !== undefined ? newActiveId : currentNav.current.activeId }
    setView(newView)
    if (newActiveId !== undefined) setActiveId(newActiveId)
  }

  function navigateDoc(id: string) {
    pushNav()
    currentNav.current = { view: 'editor', activeId: id }
    setActiveId(id)
    setView('editor')
  }

  const goBack = useCallback(() => {
    const prev = navHistory.current.pop()
    if (!prev) return
    currentNav.current = prev
    setView(prev.view)
    setActiveId(prev.activeId)
  }, [])

  useEffect(() => {
    function onMouseUp(e: MouseEvent) { if (e.button === 3) { e.preventDefault(); goBack() } }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [goBack])

  useEffect(() => {
    if (!window.api) { setError('window.api is undefined — preload not loaded'); return }
    window.api.docs.list()
      .then((rows) => { setDocs(rows); if (rows.length > 0) setActiveId(rows[0].id) })
      .catch((e) => setError(String(e)))
    Promise.all([
      window.api.settings.get('toolbar_normal'),
      window.api.settings.get('toolbar_focus'),
      window.api.settings.get('editor_line_height'),
      window.api.settings.get('editor_first_line_indent'),
      window.api.settings.get('editor_indent_size'),
      window.api.settings.get('typography_curly_quotes'),
      window.api.settings.get('typography_em_dash'),
      window.api.settings.get('typography_ellipsis'),
    ]).then(([n, f, lh, fli, is, cq, emd, ell]) => {
      if (n) { try { setToolbarNormal(JSON.parse(n)) } catch {} }
      if (f) { try { setToolbarFocus(JSON.parse(f)) } catch {} }
      setFormatting({
        lineHeight: lh ?? DEFAULT_FORMATTING.lineHeight,
        firstLineIndent: fli ?? DEFAULT_FORMATTING.firstLineIndent,
        indentSize: is ?? DEFAULT_FORMATTING.indentSize,
      })
      setTypography({
        curlyQuotes: (cq ?? '1') === '1',
        emDash:      (emd ?? '0') === '1',
        ellipsis:    (ell ?? '1') === '1',
      })
    })
  }, [])

  async function handleCreate(type: 'chapter' | 'note') {
    const title = type === 'chapter' ? 'New Chapter' : 'New Note'
    const doc = await window.api.docs.create(title, type)
    setDocs((prev) => [...prev, doc])
    navigateDoc(doc.id)
  }

  async function handleCreateSub(parentId: string) {
    const doc = await window.api.docs.create('New Chapter', 'chapter', parentId)
    setDocs((prev) => [...prev, doc])
    navigateDoc(doc.id)
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

  async function handleReorder(orderedIds: string[]) {
    await Promise.all(orderedIds.map((id, i) => window.api.docs.update(id, { sort_order: i + 1 })))
    setDocs((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]))
      const reordered = orderedIds.map((id) => byId.get(id)!).filter(Boolean)
      const rest = prev.filter((d) => !orderedIds.includes(d.id))
      return [...reordered, ...rest]
    })
  }

  const handleOpenDoc = useCallback((id: string) => {
    navigateDoc(id)
  }, [])

  if (error) return (
    <div style={{ padding: 32, color: '#f87171', fontFamily: 'monospace', background: '#13111e', height: '100vh' }}>
      <strong>Startup error:</strong><br />{error}
    </div>
  )

  const showSidebar = view === 'editor' || view === 'overview' || view === 'corkboard'

  return (
    <div
      style={{ display: 'flex', height: '100vh', background: '#13111e', color: '#e8e5f5', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', fontSize: 13 }}
      data-theme="lexicon"
    >
      <NavRail
        activeView={view}
        onNavigate={(v) => navigateTo(v)}
        onCloudSynced={() => {
          window.api.docs.list().then((rows) => setDocs(rows)).catch(() => {})
        }}
      />

      {showSidebar && (
        <Sidebar
          docs={docs}
          activeId={activeId}
          onSelect={(id) => navigateDoc(id)}
          onCreate={handleCreate}
          onCreateSub={handleCreateSub}
          onRename={handleRename}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'overview' ? (
          <OverviewView docs={docs} onOpenDoc={handleOpenDoc} />
        ) : view === 'canvas' ? (
          <TalentCanvas docs={docs} onOpenDoc={handleOpenDoc} />
        ) : view === 'corkboard' ? (
          <Corkboard docs={docs} onOpenDoc={handleOpenDoc} />
        ) : view === 'timeline' ? (
          <TimelineView docs={docs} />
        ) : view === 'stats' ? (
          <StatsView docs={docs} />
        ) : view === 'history' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#13111e' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2740', background: '#1a1825' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: '#a09cc0', margin: 0 }}>⎇ Version History</h2>
              <p style={{ fontSize: 11, color: '#55507a', marginTop: 2, marginBottom: 0 }}>Snapshots of your manuscript — powered by git</p>
            </div>
            <GitPanel />
          </div>
        ) : view === 'settings' ? (
          <SettingsView
            onToolbarChange={(n, f) => { setToolbarNormal(n); setToolbarFocus(f) }}
            onFormattingChange={(fmt) => setFormatting(fmt)}
            onTypographyChange={(t) => { setTypography(t); setTypographyVersion((v) => v + 1) }}
          />
        ) : activeId ? (
          <Editor
            key={`${activeId}-t${typographyVersion}`}
            docId={activeId}
            enabledNormal={toolbarNormal}
            enabledFocus={toolbarFocus}
            formatting={formatting}
            typography={typography}
            docMeta={docs.find((d) => d.id === activeId) ?? null}
            onMetaUpdate={async (fields) => {
              await window.api.docs.update(activeId, fields)
              setDocs((prev) => prev.map((d) => d.id === activeId ? { ...d, ...fields } : d))
            }}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#55507a', fontSize: 13 }}>
            Select a document to start writing
          </div>
        )}
      </main>
    </div>
  )
}
