import { useState, useEffect } from 'react'
import { ALL_TOOLBAR_ITEMS, GROUP_LABELS, DEFAULT_NORMAL_IDS, DEFAULT_FOCUS_IDS } from '../toolbarItems'
import type { ToolbarGroup } from '../toolbarItems'
import { DEFAULT_FORMATTING } from './Editor'
import type { EditorFormatting } from './Editor'

const C = {
  base:    '#13111e',
  raised:  '#1a1825',
  overlay: '#252235',
  border:  '#2a2740',
  accent:  '#7c6af7',
  accentLt:'#9d8ef9',
  accentBg:'rgba(124,106,247,0.12)',
  textPri: '#e8e5f5',
  textSec: '#a09cc0',
  textMut: '#55507a',
}

type Props = {
  onToolbarChange: (normal: string[], focus: string[]) => void
  onFormattingChange: (fmt: EditorFormatting) => void
}

const GROUPS = Object.keys(GROUP_LABELS) as ToolbarGroup[]

export default function SettingsView({ onToolbarChange, onFormattingChange }: Props) {
  const [normalIds, setNormalIds] = useState<string[]>(DEFAULT_NORMAL_IDS)
  const [focusIds, setFocusIds] = useState<string[]>(DEFAULT_FOCUS_IDS)
  const [saved, setSaved] = useState(false)
  const [fmt, setFmt] = useState<EditorFormatting>(DEFAULT_FORMATTING)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setExportMsg(null)
    const result = await window.api.export.manuscript()
    setExporting(false)
    if (result.saved) {
      setExportMsg(`Saved to ${result.path}`)
    } else if (result.error) {
      setExportMsg(`Error: ${result.error}`)
    }
    setTimeout(() => setExportMsg(null), 5000)
  }

  useEffect(() => {
    Promise.all([
      window.api.settings.get('toolbar_normal'),
      window.api.settings.get('toolbar_focus'),
      window.api.settings.get('editor_line_height'),
      window.api.settings.get('editor_first_line_indent'),
      window.api.settings.get('editor_indent_size'),
    ]).then(([n, f, lh, fli, is]) => {
      if (n) { try { setNormalIds(JSON.parse(n)) } catch {} }
      if (f) { try { setFocusIds(JSON.parse(f)) } catch {} }
      setFmt({
        lineHeight: lh ?? DEFAULT_FORMATTING.lineHeight,
        firstLineIndent: fli ?? DEFAULT_FORMATTING.firstLineIndent,
        indentSize: is ?? DEFAULT_FORMATTING.indentSize,
      })
    })
  }, [])

  function toggleNormal(id: string) {
    setNormalIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function toggleFocus(id: string) {
    setFocusIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function save() {
    await Promise.all([
      window.api.settings.set('toolbar_normal', JSON.stringify(normalIds)),
      window.api.settings.set('toolbar_focus',  JSON.stringify(focusIds)),
      window.api.settings.set('editor_line_height', fmt.lineHeight),
      window.api.settings.set('editor_first_line_indent', fmt.firstLineIndent),
      window.api.settings.set('editor_indent_size', fmt.indentSize),
    ])
    onToolbarChange(normalIds, focusIds)
    onFormattingChange(fmt)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function resetDefaults() {
    setNormalIds(DEFAULT_NORMAL_IDS)
    setFocusIds(DEFAULT_FOCUS_IDS)
    setFmt(DEFAULT_FORMATTING)
  }

  function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
      <button
        onClick={onChange}
        style={{
          width: 36, height: 20, borderRadius: 10, border: 'none',
          background: checked ? C.accent : C.overlay,
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: checked ? 18 : 3,
          width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'white' : C.textMut,
          transition: 'left 0.15s',
        }}/>
      </button>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: C.base, padding: '32px 40px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.textPri, margin: 0, letterSpacing: '-0.02em' }}>Settings</h1>
          <p style={{ fontSize: 12, color: C.textMut, margin: '4px 0 0' }}>Customize your writing environment</p>
        </div>

        {/* Paragraph Formatting section */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Paragraph Formatting</span>
            <div style={{ flex: 1, height: 1, background: C.border }}/>
          </div>

          <div style={{ background: C.raised, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {([
              {
                label: 'Line Spacing', key: 'lineHeight' as const,
                options: [
                  { label: 'Single (1.0)', value: '1.0' },
                  { label: 'Comfortable (1.5)', value: '1.5' },
                  { label: 'Relaxed (1.8)', value: '1.8' },
                  { label: 'Double (2.0)', value: '2.0' },
                  { label: 'Wide (2.5)', value: '2.5' },
                  { label: 'Extra wide (3.0)', value: '3.0' },
                ],
              },
              {
                label: 'First Line Indent', key: 'firstLineIndent' as const,
                options: [
                  { label: 'None', value: '0' },
                  { label: '0.5em', value: '0.5em' },
                  { label: '1em', value: '1em' },
                  { label: '1.5em', value: '1.5em' },
                  { label: '2em', value: '2em' },
                  { label: '3em', value: '3em' },
                ],
              },
              {
                label: 'Indent Depth (per level)', key: 'indentSize' as const,
                options: [
                  { label: '1em', value: '1' },
                  { label: '2em', value: '2' },
                  { label: '3em', value: '3' },
                  { label: '4em', value: '4' },
                ],
              },
            ] as const).map((row, idx) => (
              <div key={row.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px',
                borderTop: idx > 0 ? `1px solid ${C.border}` : 'none',
              }}>
                <span style={{ fontSize: 12, color: C.textPri }}>{row.label}</span>
                <select
                  value={fmt[row.key]}
                  onChange={(e) => setFmt((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    border: `1px solid ${C.border}`, background: C.overlay,
                    color: C.textPri, fontSize: 12, cursor: 'pointer', outline: 'none',
                  }}
                >
                  {row.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar section */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Editor Toolbar</span>
            <div style={{ flex: 1, height: 1, background: C.border }}/>
          </div>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px',
            padding: '6px 12px', marginBottom: 4,
          }}>
            <span style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Item</span>
            <span style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Normal</span>
            <span style={{ fontSize: 10, color: C.textMut, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Focus</span>
          </div>

          {/* Group rows */}
          {GROUPS.map((group) => {
            const items = ALL_TOOLBAR_ITEMS.filter((i) => i.group === group)
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: C.textMut,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '4px 12px', marginBottom: 2,
                }}>
                  {GROUP_LABELS[group]}
                </div>
                <div style={{ background: C.raised, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  {items.map((item, idx) => (
                    <div key={item.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                      alignItems: 'center', padding: '10px 12px',
                      borderTop: idx > 0 ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 6,
                          background: C.overlay,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: C.accentLt, fontWeight: 600, flexShrink: 0,
                        }}>{item.label}</span>
                        <div>
                          <div style={{ fontSize: 12, color: C.textPri }}>{item.title}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Toggle checked={normalIds.includes(item.id)} onChange={() => toggleNormal(item.id)} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Toggle checked={focusIds.includes(item.id)} onChange={() => toggleFocus(item.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={save}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: saved ? '#34d399' : C.accent,
                color: 'white', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s',
              }}
            >{saved ? '✓ Saved' : 'Save Changes'}</button>
            <button
              onClick={resetDefaults}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'transparent', color: C.textMut,
                fontSize: 12, cursor: 'pointer',
              }}
            >Reset Defaults</button>
          </div>
        </div>

        {/* Export section */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Export</span>
            <div style={{ flex: 1, height: 1, background: C.border }}/>
          </div>
          <div style={{ background: C.raised, borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: C.textPri, fontWeight: 500 }}>Export Manuscript (.docx)</div>
                <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>All chapters exported in order as a Word document</div>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: exporting ? 'rgba(124,106,247,0.4)' : C.accent,
                  color: 'white', fontSize: 12, fontWeight: 600,
                  cursor: exporting ? 'wait' : 'pointer', flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >{exporting ? 'Exporting…' : 'Export'}</button>
            </div>
            {exportMsg && (
              <div style={{
                marginTop: 10, fontSize: 11, padding: '7px 10px', borderRadius: 6,
                background: exportMsg.startsWith('Error') ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
                color: exportMsg.startsWith('Error') ? '#f87171' : '#34d399',
              }}>{exportMsg}</div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
