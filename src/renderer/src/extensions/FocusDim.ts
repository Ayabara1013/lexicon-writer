import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { DecorationSet, Decoration } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'

export type FocusDimConfig = {
  enabled: boolean
  unit: 'paragraph' | 'sentence'
  stepOpacity: number
  minOpacity: number
}

const focusDimKey = new PluginKey<DecorationSet>('focusDim')

// ── Sentence boundary finder ──────────────────────────────────────────────────

function sentenceBoundaries(doc: PmNode): Array<{ from: number; to: number }> {
  const results: Array<{ from: number; to: number }> = []

  doc.forEach((block, blockOffset) => {
    if (!block.isTextblock) return

    // Map each character index → doc position
    const charPos: number[] = []
    block.descendants((node, pos) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          charPos.push(blockOffset + 1 + pos + i)
        }
      }
    })

    if (charPos.length === 0) {
      results.push({ from: blockOffset + 1, to: blockOffset + block.nodeSize - 1 })
      return
    }

    let text = ''
    block.descendants((node) => { if (node.isText && node.text) text += node.text })

    // Match sentence-ending punctuation optionally followed by closing quotes
    const re = /[.!?]['"'”']?(?=\s|$)/g
    let startIdx = 0
    let m: RegExpExecArray | null

    while ((m = re.exec(text)) !== null) {
      const endIdx = m.index + m[0].length
      if (endIdx > startIdx) {
        const fromPos = charPos[startIdx]
        const toPos = (charPos[endIdx - 1] ?? charPos[charPos.length - 1]) + 1
        results.push({ from: fromPos, to: toPos })
      }
      startIdx = endIdx
      while (startIdx < text.length && text[startIdx] === ' ') startIdx++
    }

    // Trailing text after last sentence end
    if (startIdx < charPos.length) {
      results.push({ from: charPos[startIdx], to: charPos[charPos.length - 1] + 1 })
    }
  })

  return results
}

// ── Decoration builder ────────────────────────────────────────────────────────

function buildDecorations(state: EditorState, cfg: FocusDimConfig): DecorationSet {
  if (!cfg.enabled) return DecorationSet.empty

  const { from } = state.selection
  const doc = state.doc
  const decos: Decoration[] = []

  if (cfg.unit === 'paragraph') {
    let activeIdx = -1
    let idx = 0
    doc.forEach((node, offset) => {
      if (from > offset && from <= offset + node.nodeSize) activeIdx = idx
      idx++
    })

    idx = 0
    doc.forEach((node, offset) => {
      const dist = activeIdx >= 0 ? Math.abs(idx - activeIdx) : 0
      const op = Math.max(cfg.minOpacity, 1 - dist * cfg.stepOpacity)
      if (op < 0.999) {
        decos.push(Decoration.node(offset, offset + node.nodeSize, {
          style: `opacity: ${op.toFixed(2)}; transition: opacity 0.2s ease;`,
        }))
      }
      idx++
    })
  } else {
    // Sentence mode — inline decorations per sentence span
    const sentences = sentenceBoundaries(doc)
    let activeIdx = -1
    for (let i = 0; i < sentences.length; i++) {
      if (from >= sentences[i].from && from <= sentences[i].to) { activeIdx = i; break }
    }

    for (let i = 0; i < sentences.length; i++) {
      const dist = activeIdx >= 0 ? Math.abs(i - activeIdx) : 0
      const op = Math.max(cfg.minOpacity, 1 - dist * cfg.stepOpacity)
      if (op < 0.999) {
        decos.push(Decoration.inline(sentences[i].from, sentences[i].to, {
          style: `opacity: ${op.toFixed(2)}; transition: opacity 0.2s ease;`,
        }))
      }
    }
  }

  return DecorationSet.create(doc, decos)
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const FocusDimExtension = Extension.create({
  name: 'focusDim',

  addStorage() {
    return {
      enabled: false,
      unit: 'paragraph' as 'paragraph' | 'sentence',
      stepOpacity: 0.33,
      minOpacity: 0.05,
    } as FocusDimConfig
  },

  addProseMirrorPlugins() {
    const getConfig = (): FocusDimConfig => this.storage as FocusDimConfig

    return [
      new Plugin({
        key: focusDimKey,
        state: {
          init: (_config, state) => buildDecorations(state, getConfig()),
          apply: (tr, old, _oldState, newState) => {
            if (tr.docChanged || tr.selectionSet || tr.getMeta('focusDim')) {
              return buildDecorations(newState, getConfig())
            }
            return old
          },
        },
        props: {
          decorations(state) { return focusDimKey.getState(state) ?? DecorationSet.empty },
        },
      }),
    ]
  },
})
