import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { SlashCommandItem } from '../extensions/SlashCommand'

type Props = {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export type SlashMenuHandle = {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const C = {
  bg:      '#1a1825',
  border:  '#2a2740',
  overlay: '#252235',
  accent:  '#7c6af7',
  textPri: '#e8e5f5',
  textSec: '#a09cc0',
  textMut: '#55507a',
}

const SlashMenu = forwardRef<SlashMenuHandle, Props>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelected(0) }, [items])

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (e.key === 'Enter') {
        if (items[selected]) command(items[selected])
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div style={{
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      padding: '4px 0',
      minWidth: 240,
      maxWidth: 300,
      maxHeight: 320,
      overflowY: 'auto',
      zIndex: 100,
    }}>
      <div ref={listRef}>
        {items.map((item, i) => (
          <button
            key={item.title}
            onMouseDown={(e) => { e.preventDefault(); command(item) }}
            onMouseEnter={() => setSelected(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '6px 10px',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: i === selected ? `rgba(124,106,247,0.12)` : 'transparent',
              borderLeft: i === selected ? `2px solid ${C.accent}` : '2px solid transparent',
              transition: 'background 0.08s',
            }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: 6,
              background: i === selected ? `rgba(124,106,247,0.2)` : C.overlay,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: i === selected ? '#9d8ef9' : C.textMut,
              flexShrink: 0,
            }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textPri, lineHeight: 1.3 }}>{item.title}</div>
              <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.3 }}>{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'
export default SlashMenu
