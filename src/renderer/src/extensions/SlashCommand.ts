import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/core'

export type SlashCommandItem = {
  title: string
  description: string
  icon: string
  command: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashCommandItem[] = [
  {
    title: 'Paragraph',
    description: 'Plain text paragraph',
    icon: '¶',
    command: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Checklist with checkboxes',
    icon: '☑',
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Blockquote',
    description: 'Indented quote block',
    icon: '"',
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Monospace code block',
    icon: '</>',
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    icon: '—',
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Status Window',
    description: 'LitRPG status box',
    icon: '🟦',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'status', title: 'Character Status' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
  {
    title: 'Achievement',
    description: 'LitRPG achievement box',
    icon: '🟨',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'achievement', title: 'Achievement Unlocked' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
  {
    title: 'Quest',
    description: 'LitRPG quest box',
    icon: '🟩',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'quest', title: 'New Quest' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
  {
    title: 'Skill Window',
    description: 'LitRPG skill box',
    icon: '🟦',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'skill', title: 'Skill Learned' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
  {
    title: 'Item Window',
    description: 'LitRPG item box',
    icon: '🟪',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'item', title: 'Item Acquired' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
  {
    title: 'Notification',
    description: 'LitRPG notification box',
    icon: '⬜',
    command: (e) => e.chain().focus().insertContent({ type: 'systemWindow', attrs: { windowType: 'notification', title: 'System Notification' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this window…' }] }] }).run(),
  },
]

type SlashCommandOptions = {
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }) => {
          props.command(editor)
          editor.chain().focus().deleteRange(range).run()
        },
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
