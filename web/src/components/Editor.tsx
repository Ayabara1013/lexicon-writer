import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import Link from '@tiptap/extension-link'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import { Extension } from '@tiptap/core'
import type { Command } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Code, Highlighter, Palette, Link as LinkIcon, RemoveFormatting,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo,
  IndentIncrease, IndentDecrease,
  Quote, CodeSquare, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Zap, Search, ChevronDown,
  ArrowLeft, PanelBottom,
  ChevronUp, ChevronDown as ChevronDownIcon,
  Replace,
} from 'lucide-react'
import { SystemWindow } from '../extensions/SystemWindow'
import type { WindowType } from '../extensions/SystemWindow'
import SceneMetaBar from './SceneMetaBar'
import { SlashCommand, SLASH_ITEMS } from '../extensions/SlashCommand'
import type { SlashCommandItem } from '../extensions/SlashCommand'
import SlashMenu from './SlashMenu'
import type { SlashMenuHandle } from './SlashMenu'
import { createRoot } from 'react-dom/client'
import {
  ALL_TOOLBAR_ITEMS, DEFAULT_NORMAL_IDS, DEFAULT_FOCUS_IDS,
  FONT_FAMILIES, FONT_SIZES, TEXT_COLORS,
} from '../toolbarItems'

// ── Custom extensions ────────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: { indent: () => ReturnType }
    outdent: { outdent: () => ReturnType }
  }
}

const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'blockquote'],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
          renderHTML: (attrs) =>
            attrs.indent > 0 ? { 'data-indent': attrs.indent } : {},
        },
      },
    }]
  },
  addCommands() {
    const applyIndent = (delta: 1 | -1): Command => ({ editor, tr, dispatch }) => {
      const { from, to } = editor.state.selection
      let changed = false
      editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if (!['paragraph', 'heading', 'blockquote'].includes(node.type.name)) return
        const cur = (node.attrs.indent as number) || 0
        const next = Math.max(0, Math.min(8, cur + delta))
        if (next !== cur) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next }); changed = true }
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    }
    return {
      indent:  () => applyIndent(1),
      outdent: () => applyIndent(-1),
    }
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem'))
          return this.editor.chain().focus().sinkListItem('listItem').run()
        return this.editor.commands.indent()
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem'))
          return this.editor.chain().focus().liftListItem('listItem').run()
        return this.editor.commands.outdent()
      },
    }
  },
})

// ── Types ────────────────────────────────────────────────────────────────────

export type EditorFormatting = {
  lineHeight: string      // e.g. '1.5', '1.8', '2.0'
  firstLineIndent: string // e.g. '0', '1em', '1.5em', '2em'
  indentSize: string      // em per indent level, e.g. '2'
}

export const DEFAULT_FORMATTING: EditorFormatting = {
  lineHeight: '1.8',
  firstLineIndent: '0',
  indentSize: '2',
}

type Props = {
  docId: string
  enabledNormal?: string[]
  enabledFocus?: string[]
  formatting?: EditorFormatting
  onMetaUpdate?: (fields: { word_target?: number | null; pov?: string | null; location?: string | null; scene_status?: string | null }) => void
  docMeta?: import('../env').DocMeta | null
}

// ── Style tokens ─────────────────────────────────────────────────────────────

const T = {
  bg:     '#1a1825',
  border: '#2a2740',
  overlay:'#252235',
  accent: '#7c6af7',
  textMut:'#55507a',
  textSec:'#a09cc0',
  textPri:'#e8e5f5',
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: T.border, margin: '0 3px', flexShrink: 0 }} />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Editor({ docId, enabledNormal, enabledFocus, formatting, onMetaUpdate, docMeta }: Props) {
  const fmt = formatting ?? DEFAULT_FORMATTING
  const [loaded, setLoaded]               = useState(false)
  const [focusMode, setFocusMode]         = useState(false)
  const [focusToolbarOpen, setFocusToolbarOpen] = useState(false)
  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [linkPopupOpen, setLinkPopupOpen] = useState(false)
  const [linkUrl, setLinkUrl]             = useState('')
  const [findOpen, setFindOpen]           = useState(false)
  const [findQuery, setFindQuery]         = useState('')
  const [replaceQuery, setReplaceQuery]   = useState('')
  const [matchCount, setMatchCount]       = useState(0)
  const [matchIndex, setMatchIndex]       = useState(-1)
  const [dragHandleTop, setDragHandleTop] = useState<number | null>(null)
  const [dragNodePos, setDragNodePos]     = useState<number | null>(null)

  const saveTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const systemMenuRef  = useRef<HTMLDivElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const linkPopupRef   = useRef<HTMLDivElement>(null)
  const findInputRef   = useRef<HTMLInputElement>(null)
  const scrollRef      = useRef<HTMLDivElement>(null)

  const normalEnabled = enabledNormal ?? DEFAULT_NORMAL_IDS
  const focusEnabled  = enabledFocus  ?? DEFAULT_FOCUS_IDS

  // ── Editor setup ──────────────────────────────────────────────────────────

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      CharacterCount,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Superscript,
      Subscript,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Indent,
      SystemWindow,
      SlashCommand.configure({
        suggestion: {
          char: '/',
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return q ? SLASH_ITEMS.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) : SLASH_ITEMS
          },
          command: ({ editor, range, props }: { editor: import('@tiptap/core').Editor; range: import('@tiptap/pm/state').Transaction['steps'][0] extends infer T ? T extends { from: number } ? { from: number; to: number } : never : never; props: SlashCommandItem }) => {
            editor.chain().focus().deleteRange(range as { from: number; to: number }).run()
            props.command(editor)
          },
          render: () => {
            let wrapper: HTMLDivElement | null = null
            let root: ReturnType<typeof createRoot> | null = null
            let menuRef: SlashMenuHandle | null = null

            return {
              onStart(props: Parameters<NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>>[0]) {
                wrapper = document.createElement('div')
                wrapper.style.cssText = 'position:fixed;z-index:9999'
                document.body.appendChild(wrapper)
                root = createRoot(wrapper)

                const pos = props.clientRect?.()
                if (pos) {
                  wrapper.style.top = `${pos.bottom + 4}px`
                  wrapper.style.left = `${pos.left}px`
                }

                root.render(
                  <SlashMenu
                    ref={(r) => { menuRef = r }}
                    items={props.items as SlashCommandItem[]}
                    command={(item) => props.command(item)}
                  />
                )
              },
              onUpdate(props: Parameters<NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>>[0]) {
                const pos = props.clientRect?.()
                if (pos && wrapper) {
                  wrapper.style.top = `${pos.bottom + 4}px`
                  wrapper.style.left = `${pos.left}px`
                }
                root?.render(
                  <SlashMenu
                    ref={(r) => { menuRef = r }}
                    items={props.items as SlashCommandItem[]}
                    command={(item) => props.command(item)}
                  />
                )
              },
              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === 'Escape') return true
                return menuRef?.onKeyDown(props.event) ?? false
              },
              onExit() {
                root?.unmount()
                wrapper?.remove()
                wrapper = null; root = null; menuRef = null
              },
            }
          },
        },
      }),
    ],
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none' }
    },
    onUpdate: ({ editor }) => {
      if (!loaded) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        api.docs.update(docId, { content: editor.getHTML() })
      }, 800)
    },
  })

  useEffect(() => {
    setLoaded(false)
    api.docs.get(docId).then((doc) => {
      if (!doc || !editor) return
      editor.commands.setContent(doc.content || '', false)
      setLoaded(true)
    })
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [docId, editor])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (findOpen) { setFindOpen(false); return }
        if (focusMode) { setFocusMode(false); setFocusToolbarOpen(false) }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setFindOpen((o) => { if (!o) setTimeout(() => findInputRef.current?.focus(), 30); return !o })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findOpen, focusMode])

  // ── Drag handle tracking ──────────────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !editor) return
    function onMove(e: MouseEvent) {
      if (!editor) return
      const view = editor.view
      const result = view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!result) { setDragHandleTop(null); return }
      const $pos = view.state.doc.resolve(result.pos)
      let nodePos: number | null = null
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d - 1).type.name === 'doc') { nodePos = $pos.before(d); break }
      }
      if (nodePos === null) { setDragHandleTop(null); return }
      const dom = view.nodeDOM(nodePos) as HTMLElement | null
      if (!dom) { setDragHandleTop(null); return }
      const scrollRect = el.getBoundingClientRect()
      const nodeRect = dom.getBoundingClientRect()
      setDragHandleTop(nodeRect.top - scrollRect.top + el.scrollTop + nodeRect.height / 2 - 8)
      setDragNodePos(nodePos)
    }
    function onLeave() { setDragHandleTop(null) }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [editor])

  function handleDragStart(e: React.DragEvent) {
    if (dragNodePos === null || !editor) return
    const view = editor.view
    const node = view.state.doc.nodeAt(dragNodePos)
    if (!node) return
    const sel = NodeSelection.create(view.state.doc, dragNodePos)
    view.dispatch(view.state.tr.setSelection(sel))
    ;(view as any).dragging = { slice: sel.content(), move: true }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.textContent || ' ')
  }

  // Close popups on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (systemMenuRef.current && !systemMenuRef.current.contains(e.target as Node)) setSystemMenuOpen(false)
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setColorPickerOpen(false)
      if (linkPopupRef.current && !linkPopupRef.current.contains(e.target as Node)) setLinkPopupOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ── Find & Replace logic ──────────────────────────────────────────────────

  function getMatches(query: string) {
    if (!editor || !query) return []
    const results: { from: number; to: number }[] = []
    const q = query.toLowerCase()
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      let i = 0
      while (true) {
        const idx = node.text.toLowerCase().indexOf(q, i)
        if (idx === -1) break
        results.push({ from: pos + idx, to: pos + idx + q.length })
        i = idx + 1
      }
    })
    return results
  }

  useEffect(() => {
    if (!findOpen) { setMatchCount(0); setMatchIndex(-1); return }
    const m = getMatches(findQuery)
    setMatchCount(m.length)
    if (matchIndex >= m.length) setMatchIndex(m.length - 1)
  }, [findQuery, findOpen, editor?.state])

  function findNav(dir: 1 | -1) {
    const m = getMatches(findQuery)
    if (!m.length || !editor) return
    const next = ((matchIndex + dir) + m.length) % m.length
    setMatchIndex(next)
    editor.commands.setTextSelection({ from: m[next].from, to: m[next].to })
    editor.commands.scrollIntoView()
  }

  function replaceOne() {
    const m = getMatches(findQuery)
    if (!m.length || !editor) return
    const idx = matchIndex >= 0 && matchIndex < m.length ? matchIndex : 0
    const { from, to } = m[idx]
    editor.chain().focus().setTextSelection({ from, to }).insertContent(replaceQuery).run()
  }

  function replaceAll() {
    if (!editor || !findQuery) return
    const m = getMatches(findQuery)
    if (!m.length) return
    const { tr, schema } = editor.state
    ;[...m].reverse().forEach(({ from, to }) => {
      tr.replaceWith(from, to, replaceQuery ? schema.text(replaceQuery) : [])
    })
    editor.view.dispatch(tr)
    setMatchCount(0); setMatchIndex(-1)
  }

  // ── Link insertion ────────────────────────────────────────────────────────

  function openLinkPopup() {
    const existing = editor?.getAttributes('link').href ?? ''
    setLinkUrl(existing)
    setLinkPopupOpen(true)
  }

  function applyLink() {
    if (!editor) return
    if (linkUrl.trim()) editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    else editor.chain().focus().unsetLink().run()
    setLinkPopupOpen(false)
    setLinkUrl('')
  }

  // ── Insert system window ──────────────────────────────────────────────────

  function insertSystemWindow(type: WindowType) {
    editor?.chain().focus().insertContent({
      type: 'systemWindow',
      attrs: {
        windowType: type,
        title: type === 'status' ? 'Character Status'
             : type === 'achievement' ? 'Achievement Unlocked'
             : type === 'quest' ? 'New Quest'
             : type === 'item' ? 'Item Acquired'
             : type === 'skill' ? 'Skill Learned' : 'System Notification',
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }],
    }).run()
  }

  // ── Render single toolbar item ─────────────────────────────────────────────

  const btn = useCallback((
    active: boolean, action: () => void, label: React.ReactNode, title: string,
    extra?: React.CSSProperties
  ) => (
    <button
      key={title}
      title={title}
      onMouseDown={(e) => { e.preventDefault(); action() }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 28, minWidth: 28, padding: '0 5px',
        borderRadius: 5, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: active ? 600 : 500,
        background: active ? 'rgba(124,106,247,0.15)' : 'transparent',
        color: active ? '#9d8ef9' : T.textMut,
        transition: 'background 0.1s, color 0.1s',
        ...extra,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = T.overlay; e.currentTarget.style.color = T.textSec } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMut } }}
    >{label}</button>
  ), [])

  const selectStyle: React.CSSProperties = {
    height: 26, padding: '0 4px', borderRadius: 5,
    border: `1px solid ${T.border}`, background: T.overlay,
    color: T.textSec, fontSize: 11, cursor: 'pointer', outline: 'none',
  }

  function renderItem(id: string, floating: boolean): React.ReactNode {
    if (!editor) return null

    switch (id) {
      case 'fontFamily': {
        const cur = editor.getAttributes('textStyle').fontFamily ?? ''
        return (
          <select key="fontFamily" title="Font Family" style={{ ...selectStyle, maxWidth: 80 }}
            value={cur}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run()
              else editor.chain().focus().unsetFontFamily().run()
            }}
          >
            {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        )
      }
      case 'fontSize': {
        const cur = editor.getAttributes('textStyle').fontSize ?? ''
        return (
          <select key="fontSize" title="Font Size" style={{ ...selectStyle, width: 56 }}
            value={cur}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
          >
            {FONT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        )
      }
      case 'bold':          return btn(editor.isActive('bold'),          () => editor.chain().focus().toggleBold().run(),          <Bold size={14}/>,             'Bold')
      case 'italic':        return btn(editor.isActive('italic'),        () => editor.chain().focus().toggleItalic().run(),        <Italic size={14}/>,           'Italic')
      case 'underline':     return btn(editor.isActive('underline'),     () => editor.chain().focus().toggleUnderline().run(),     <UnderlineIcon size={14}/>,    'Underline')
      case 'strike':        return btn(editor.isActive('strike'),        () => editor.chain().focus().toggleStrike().run(),        <Strikethrough size={14}/>,    'Strikethrough')
      case 'superscript':   return btn(editor.isActive('superscript'),   () => editor.chain().focus().toggleSuperscript().run(),   <SuperscriptIcon size={14}/>,  'Superscript')
      case 'subscript':     return btn(editor.isActive('subscript'),     () => editor.chain().focus().toggleSubscript().run(),     <SubscriptIcon size={14}/>,    'Subscript')
      case 'code':          return btn(editor.isActive('code'),          () => editor.chain().focus().toggleCode().run(),          <Code size={14}/>,             'Inline Code')
      case 'highlight':     return btn(editor.isActive('highlight'),     () => editor.chain().focus().toggleHighlight().run(),     <Highlighter size={14}/>,      'Highlight', editor.isActive('highlight') ? { color: '#f59e0b' } : {})
      case 'clearFormatting': return btn(false, () => editor.chain().focus().unsetAllMarks().clearNodes().run(), <RemoveFormatting size={14}/>, 'Clear Formatting')
      case 'h1':            return btn(editor.isActive('heading',{level:1}), () => editor.chain().focus().toggleHeading({level:1}).run(), <Heading1 size={14}/>, 'Heading 1')
      case 'h2':            return btn(editor.isActive('heading',{level:2}), () => editor.chain().focus().toggleHeading({level:2}).run(), <Heading2 size={14}/>, 'Heading 2')
      case 'h3':            return btn(editor.isActive('heading',{level:3}), () => editor.chain().focus().toggleHeading({level:3}).run(), <Heading3 size={14}/>, 'Heading 3')
      case 'bulletList':    return btn(editor.isActive('bulletList'),    () => editor.chain().focus().toggleBulletList().run(),    <List size={14}/>,             'Bullet List')
      case 'orderedList':   return btn(editor.isActive('orderedList'),   () => editor.chain().focus().toggleOrderedList().run(),   <ListOrdered size={14}/>,      'Ordered List')
      case 'taskList':      return btn(editor.isActive('taskList'),      () => editor.chain().focus().toggleTaskList().run(),      <ListTodo size={14}/>,         'Task List')
      case 'indent':        return btn(false, () => editor.chain().focus().indent().run(),  <IndentIncrease size={14}/>, 'Indent (Tab)')
      case 'outdent':       return btn(false, () => editor.chain().focus().outdent().run(), <IndentDecrease size={14}/>, 'Outdent (Shift+Tab)')
      case 'blockquote':    return btn(editor.isActive('blockquote'),    () => editor.chain().focus().toggleBlockquote().run(),    <Quote size={14}/>,            'Blockquote')
      case 'codeBlock':     return btn(editor.isActive('codeBlock'),     () => editor.chain().focus().toggleCodeBlock().run(),     <CodeSquare size={14}/>,       'Code Block')
      case 'horizontalRule':return btn(false,                            () => editor.chain().focus().setHorizontalRule().run(),   <Minus size={14}/>,            'Insert Divider')
      case 'alignLeft':     return btn(editor.isActive({textAlign:'left'}),    () => editor.chain().focus().setTextAlign('left').run(),    <AlignLeft size={14}/>,    'Align Left')
      case 'alignCenter':   return btn(editor.isActive({textAlign:'center'}),  () => editor.chain().focus().setTextAlign('center').run(),  <AlignCenter size={14}/>,  'Align Center')
      case 'alignRight':    return btn(editor.isActive({textAlign:'right'}),   () => editor.chain().focus().setTextAlign('right').run(),   <AlignRight size={14}/>,   'Align Right')
      case 'alignJustify':  return btn(editor.isActive({textAlign:'justify'}), () => editor.chain().focus().setTextAlign('justify').run(), <AlignJustify size={14}/>, 'Justify')

      case 'textColor': {
        const curColor = editor.getAttributes('textStyle').color ?? ''
        return (
          <div key="textColor" ref={colorPickerRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              title="Text Color"
              onMouseDown={(e) => { e.preventDefault(); setColorPickerOpen((o) => !o) }}
              style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2,
                height: 26, width: 26, borderRadius: 5, border: 'none',
                cursor: 'pointer', background: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.overlay)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Palette size={14} style={{ color: curColor || T.textMut }} />
            </button>
            {colorPickerOpen && (
              <div style={{
                position: 'absolute',
                [floating ? 'bottom' : 'top']: 'calc(100% + 4px)',
                left: 0, zIndex: 60,
                background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'grid', gridTemplateColumns: 'repeat(6, 20px)', gap: 4,
              }}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setColorPickerOpen(false) }}
                  title="Remove color"
                  style={{ width: 20, height: 20, borderRadius: 4, border: `1px solid ${T.border}`, background: T.overlay, cursor: 'pointer', fontSize: 10, color: T.textMut }}
                >✕</button>
                {TEXT_COLORS.slice(1).map((c) => (
                  <button key={c.value}
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c.value).run(); setColorPickerOpen(false) }}
                    title={c.label}
                    style={{
                      width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
                      background: c.value,
                      border: curColor === c.value ? '2px solid white' : `1px solid ${T.border}`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      }

      case 'link': {
        const isLink = editor.isActive('link')
        return (
          <div key="link" ref={linkPopupRef} style={{ position: 'relative', display: 'inline-flex' }}>
            {btn(isLink, openLinkPopup, <LinkIcon size={14}/>, 'Insert / Edit Link')}
            {linkPopupOpen && (
              <div style={{
                position: 'absolute',
                [floating ? 'bottom' : 'top']: 'calc(100% + 4px)',
                left: 0, zIndex: 60, width: 240,
                background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <input
                  autoFocus
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkPopupOpen(false) }}
                  style={{
                    width: '100%', padding: '5px 8px', borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.overlay,
                    color: T.textPri, fontSize: 11, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onMouseDown={(e) => { e.preventDefault(); applyLink() }}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: 'none', background: T.accent, color: 'white', fontSize: 11, cursor: 'pointer' }}>
                    Apply
                  </button>
                  {isLink && (
                    <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetLink().run(); setLinkPopupOpen(false) }}
                      style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMut, fontSize: 11, cursor: 'pointer' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      }

      case 'system': {
        return (
          <div key="system" ref={systemMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); setSystemMenuOpen((o) => !o) }}
              title="System Window"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                height: 26, padding: '0 7px', borderRadius: 5, border: 'none',
                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: systemMenuOpen ? 'rgba(124,106,247,0.15)' : 'transparent',
                color: systemMenuOpen ? '#9d8ef9' : T.textMut,
              }}
              onMouseEnter={(e) => { if (!systemMenuOpen) { e.currentTarget.style.background = T.overlay; e.currentTarget.style.color = T.textSec } }}
              onMouseLeave={(e) => { if (!systemMenuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMut } }}
            >
              <Zap size={14}/><ChevronDown size={10} style={{ opacity: 0.5, marginLeft: 1 }}/>
            </button>
            {systemMenuOpen && (
              <div style={{
                position: 'absolute',
                [floating ? 'bottom' : 'top']: 'calc(100% + 4px)',
                left: 0, zIndex: 60,
                background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: '4px 0',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: 140,
              }}>
                {(['status','achievement','quest','item','skill','notification'] as WindowType[]).map((type) => (
                  <button key={type}
                    onMouseDown={(e) => { e.preventDefault(); insertSystemWindow(type); setSystemMenuOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: T.textSec }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.overlay)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {type === 'status' ? '🟦 ' : type === 'achievement' ? '🟨 ' : type === 'quest' ? '🟩 ' : type === 'item' ? '🟪 ' : type === 'skill' ? '🟦 ' : '⬜ '}
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }

      case 'findReplace':
        return btn(findOpen, () => setFindOpen((o) => !o), <Search size={14}/>, 'Find & Replace (Ctrl+F)')

      default: return null
    }
  }

  // ── Render toolbar ─────────────────────────────────────────────────────────

  function renderToolbar(enabledIds: string[], floating: boolean) {
    const groups: string[][] = []
    let curGroup = '', curItems: string[] = []
    for (const id of enabledIds) {
      const def = ALL_TOOLBAR_ITEMS.find((i) => i.id === id)
      if (!def) continue
      if (def.group !== curGroup) {
        if (curItems.length) groups.push(curItems)
        curItems = [id]; curGroup = def.group
      } else {
        curItems.push(id)
      }
    }
    if (curItems.length) groups.push(curItems)

    return (
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, padding: '5px 10px',
        ...(floating ? {
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          background: 'rgba(26,24,37,0.97)', border: `1px solid ${T.border}`,
          backdropFilter: 'blur(8px)', zIndex: 50, maxWidth: 'calc(100% - 80px)',
        } : {
          background: T.bg, borderBottom: `1px solid ${T.border}`,
        }),
      }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {gi > 0 && <Divider />}
            {group.map((id) => <span key={id}>{renderItem(id, floating)}</span>)}
          </div>
        ))}
        {!floating && (
          <>
            <div style={{ flex: 1 }} />
            <button
              onMouseDown={(e) => { e.preventDefault(); setFocusMode(true) }}
              title="Focus mode (Esc to exit)"
              style={{ height: 26, padding: '0 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, background: 'transparent', color: T.textMut }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.textSec)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMut)}
            ><PanelBottom size={13} style={{ marginRight: 4 }}/>Focus</button>
          </>
        )}
      </div>
    )
  }

  // ── Find & Replace panel ──────────────────────────────────────────────────

  function renderFindPanel() {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', background: T.overlay, borderBottom: `1px solid ${T.border}`,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={findInputRef}
            placeholder="Find…"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') findNav(e.shiftKey ? -1 : 1) }}
            style={{ width: 160, padding: '3px 7px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.bg, color: T.textPri, fontSize: 11, outline: 'none' }}
          />
          <span style={{ fontSize: 10, color: T.textMut, minWidth: 40 }}>
            {findQuery ? `${matchCount > 0 ? (matchIndex >= 0 ? matchIndex + 1 : '?') : 0}/${matchCount}` : ''}
          </span>
          <button onMouseDown={(e) => { e.preventDefault(); findNav(-1) }} title="Previous (Shift+Enter)" style={{ ...navBtnStyle }}><ChevronUp size={12}/></button>
          <button onMouseDown={(e) => { e.preventDefault(); findNav(1)  }} title="Next (Enter)"          style={{ ...navBtnStyle }}><ChevronDownIcon size={12}/></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            placeholder="Replace…"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') replaceOne() }}
            style={{ width: 160, padding: '3px 7px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.bg, color: T.textPri, fontSize: 11, outline: 'none' }}
          />
          <button onMouseDown={(e) => { e.preventDefault(); replaceOne() }} style={{ ...actionBtnStyle }}>Replace</button>
          <button onMouseDown={(e) => { e.preventDefault(); replaceAll() }} style={{ ...actionBtnStyle }}>All</button>
        </div>
        <button onMouseDown={(e) => { e.preventDefault(); setFindOpen(false) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.textMut, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
    )
  }

  const navBtnStyle: React.CSSProperties = { width: 22, height: 22, borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.textSec, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const
  const actionBtnStyle: React.CSSProperties = { padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.bg, color: T.textSec, cursor: 'pointer', fontSize: 11 } as const

  // ── Final render ──────────────────────────────────────────────────────────

  const words = editor?.storage.characterCount.words() ?? 0
  const chars = editor?.storage.characterCount.characters() ?? 0

  const indentCss = Array.from({ length: 8 }, (_, i) => i + 1)
    .map((n) => `[data-indent="${n}"] { padding-left: calc(${n} * ${fmt.indentSize}em); }`)
    .join('\n')
  const editorCss = `
    .ProseMirror p { line-height: ${fmt.lineHeight}; text-indent: ${fmt.firstLineIndent}; }
    .ProseMirror li p { text-indent: 0; }
    .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { line-height: ${fmt.lineHeight}; }
    ${indentCss}
  `

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: focusMode ? '#0d0b18' : undefined }}>
      <style>{editorCss}</style>
      {!focusMode && renderToolbar(normalEnabled, false)}
      {!focusMode && findOpen && renderFindPanel()}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {!focusMode && dragHandleTop !== null && (
          <div
            draggable
            onDragStart={handleDragStart}
            title="Drag to reorder"
            style={{
              position: 'absolute', left: 8, top: dragHandleTop,
              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'grab', color: T.textMut, fontSize: 13, userSelect: 'none',
              opacity: 0.4, zIndex: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
          >⠿</div>
        )}
        <div style={{ maxWidth: focusMode ? 620 : 720, margin: '0 auto', padding: focusMode ? '64px 32px' : '48px 64px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {focusMode && (
        <>
          <button
            onMouseDown={(e) => { e.preventDefault(); setFocusMode(false); setFocusToolbarOpen(false) }}
            title="Exit focus mode (Esc)"
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 50, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', color: 'white', fontSize: 18, opacity: 0.1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.6')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.1')}
          ><ArrowLeft size={16}/></button>

          {focusToolbarOpen && renderToolbar(focusEnabled, true)}

          <button
            onMouseDown={(e) => { e.preventDefault(); setFocusToolbarOpen((o) => !o) }}
            title="Toggle toolbar"
            style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 50, width: 36, height: 36, borderRadius: '50%', border: `1px solid rgba(255,255,255,0.1)`, background: focusToolbarOpen ? 'rgba(124,106,247,0.2)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', color: 'white', fontSize: 14, opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.2')}
          ><Replace size={15}/></button>
        </>
      )}

      {!focusMode && docMeta && onMetaUpdate && (
        <SceneMetaBar doc={docMeta} wordCount={words} onUpdate={onMetaUpdate} />
      )}
      {!focusMode && (!docMeta || !onMetaUpdate) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '5px 14px', borderTop: `1px solid ${T.border}`, background: T.bg, fontSize: 11, color: T.textMut }}>
          <span>{words.toLocaleString()} words</span>
          <span>{chars.toLocaleString()} chars</span>
          {!loaded && <span style={{ marginLeft: 'auto' }}>Loading…</span>}
        </div>
      )}
    </div>
  )
}
