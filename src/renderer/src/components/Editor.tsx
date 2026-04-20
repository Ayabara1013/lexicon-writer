import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'

type Props = { docId: string }

export default function Editor({ docId }: Props) {
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      CharacterCount
    ],
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none' }
    },
    onUpdate: ({ editor }) => {
      if (!loaded) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        window.api.docs.update(docId, { content: editor.getHTML() })
      }, 800)
    }
  })

  useEffect(() => {
    setLoaded(false)
    window.api.docs.get(docId).then((doc) => {
      if (!doc || !editor) return
      editor.commands.setContent(doc.content || '', false)
      setLoaded(true)
    })
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [docId, editor])

  const words = editor?.storage.characterCount.words() ?? 0
  const chars = editor?.storage.characterCount.characters() ?? 0

  const toolbarButtons = [
    { label: 'B', title: 'Bold', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
    { label: 'I', title: 'Italic', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
    { label: 'S', title: 'Strikethrough', action: () => editor?.chain().focus().toggleStrike().run(), active: editor?.isActive('strike') }
  ]

  const headingButtons = [
    { label: 'H1', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive('heading', { level: 1 }) },
    { label: 'H2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading', { level: 2 }) }
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-base-300 bg-base-200">
        {toolbarButtons.map(({ label, title, action, active }) => (
          <button
            key={label}
            title={title}
            onMouseDown={(e) => { e.preventDefault(); action() }}
            className={`w-7 h-7 rounded text-sm font-medium transition-colors ${
              active ? 'bg-primary text-primary-content' : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-4 bg-base-300 mx-1" />
        {headingButtons.map(({ label, action, active }) => (
          <button
            key={label}
            onMouseDown={(e) => { e.preventDefault(); action() }}
            className={`px-2 h-7 rounded text-xs font-medium transition-colors ${
              active ? 'bg-primary text-primary-content' : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-4 bg-base-300 mx-1" />
        <button
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run() }}
          className={`px-2 h-7 rounded text-xs font-medium transition-colors ${
            editor?.isActive('bulletList') ? 'bg-primary text-primary-content' : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
          }`}
        >
          List
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-16 py-12">
        <div className="max-w-2xl mx-auto min-h-full">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-base-300 bg-base-200 text-xs text-base-content/40">
        <span>{words} words</span>
        <span>{chars} characters</span>
        {!loaded && <span className="ml-auto">Loading…</span>}
      </div>
    </div>
  )
}
