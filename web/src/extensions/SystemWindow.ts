import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import SystemWindowView from '../components/SystemWindowView'

export type WindowType = 'status' | 'achievement' | 'quest' | 'item' | 'skill' | 'notification'

export const SystemWindow = Node.create({
  name: 'systemWindow',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      windowType: { default: 'status' as WindowType },
      title: { default: 'System Notification' }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-system-window]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-system-window': node.attrs.windowType, 'data-title': node.attrs.title }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SystemWindowView)
  }
})
