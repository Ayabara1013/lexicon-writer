import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'

export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      CharacterCount
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none h-full'
      }
    }
  })

  const words = editor?.storage.characterCount.words() ?? 0
  const chars = editor?.storage.characterCount.characters() ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-base-300 bg-base-200">
        {[
          { label: 'B', action: () => editor?.chain().focus().toggleBold().run(), mark: 'bold' },
          { label: 'I', action: () => editor?.chain().focus().toggleItalic().run(), mark: 'italic' },
          { label: 'S', action: () => editor?.chain().focus().toggleStrike().run(), mark: 'strike' }
        ].map(({ label, action, mark }) => (
          <button
            key={mark}
            onMouseDown={(e) => { e.preventDefault(); action() }}
            className={`w-7 h-7 rounded text-sm font-medium transition-colors ${
              editor?.isActive(mark)
                ? 'bg-primary text-primary-content'
                : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-4 bg-base-300 mx-1" />
        {[
          { label: 'H1', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive('heading', { level: 1 }) },
          { label: 'H2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading', { level: 2 }) }
        ].map(({ label, action, active }) => (
          <button
            key={label}
            onMouseDown={(e) => { e.preventDefault(); action() }}
            className={`px-2 h-7 rounded text-xs font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-content'
                : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Writing area */}
      <div className="flex-1 overflow-y-auto px-16 py-12">
        <div className="max-w-2xl mx-auto min-h-full">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-base-300 bg-base-200 text-xs text-base-content/40">
        <span>{words} words</span>
        <span>{chars} characters</span>
      </div>
    </div>
  )
}
