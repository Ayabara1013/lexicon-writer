export type ToolbarGroup = 'text' | 'format' | 'heading' | 'list' | 'block' | 'align' | 'special'

export type ToolbarItemDef = {
  id: string
  label: string
  title: string
  group: ToolbarGroup
}

export const GROUP_LABELS: Record<ToolbarGroup, string> = {
  text:    'Font',
  format:  'Text Formatting',
  heading: 'Headings',
  list:    'Lists & Indent',
  block:   'Block Elements',
  align:   'Alignment',
  special: 'Special',
}

export const ALL_TOOLBAR_ITEMS: ToolbarItemDef[] = [
  // text
  { id: 'fontFamily',      label: 'Font',  title: 'Font Family',    group: 'text' },
  { id: 'fontSize',        label: 'Size',  title: 'Font Size',      group: 'text' },
  // format
  { id: 'bold',            label: 'B',     title: 'Bold',           group: 'format' },
  { id: 'italic',          label: 'I',     title: 'Italic',         group: 'format' },
  { id: 'underline',       label: 'U',     title: 'Underline',      group: 'format' },
  { id: 'strike',          label: 'S',     title: 'Strikethrough',  group: 'format' },
  { id: 'superscript',     label: 'Xˢ',   title: 'Superscript',    group: 'format' },
  { id: 'subscript',       label: 'Xₛ',   title: 'Subscript',      group: 'format' },
  { id: 'code',            label: '<>',    title: 'Inline Code',    group: 'format' },
  { id: 'highlight',       label: '▮',     title: 'Highlight',      group: 'format' },
  { id: 'textColor',       label: 'A',     title: 'Text Color',     group: 'format' },
  { id: 'link',            label: '⎘',     title: 'Insert Link',    group: 'format' },
  { id: 'clearFormatting', label: '✕ fmt', title: 'Clear Formatting', group: 'format' },
  // heading
  { id: 'h1',              label: 'H1',    title: 'Heading 1',      group: 'heading' },
  { id: 'h2',              label: 'H2',    title: 'Heading 2',      group: 'heading' },
  { id: 'h3',              label: 'H3',    title: 'Heading 3',      group: 'heading' },
  // list
  { id: 'bulletList',      label: '•—',    title: 'Bullet List',    group: 'list' },
  { id: 'orderedList',     label: '1.',    title: 'Ordered List',   group: 'list' },
  { id: 'taskList',        label: '☑',     title: 'Task List',      group: 'list' },
  { id: 'indent',          label: '→|',    title: 'Indent',         group: 'list' },
  { id: 'outdent',         label: '|←',    title: 'Outdent',        group: 'list' },
  // block
  { id: 'blockquote',      label: '"',     title: 'Blockquote',     group: 'block' },
  { id: 'codeBlock',       label: '{ }',   title: 'Code Block',     group: 'block' },
  { id: 'horizontalRule',  label: '—',     title: 'Divider',        group: 'block' },
  // align
  { id: 'alignLeft',       label: '⫷',     title: 'Align Left',     group: 'align' },
  { id: 'alignCenter',     label: '≡',     title: 'Align Center',   group: 'align' },
  { id: 'alignRight',      label: '⫸',     title: 'Align Right',    group: 'align' },
  { id: 'alignJustify',    label: '☰',     title: 'Justify',        group: 'align' },
  // special
  { id: 'system',          label: '⚡',    title: 'System Window',  group: 'special' },
  { id: 'findReplace',     label: '⌕',     title: 'Find & Replace', group: 'special' },
]

export const DEFAULT_NORMAL_IDS = ALL_TOOLBAR_ITEMS.map((i) => i.id)

export const DEFAULT_FOCUS_IDS = [
  'bold', 'italic', 'underline', 'strike',
  'h1', 'h2',
  'bulletList',
  'alignJustify',
  'system',
]

export const FONT_FAMILIES = [
  { label: 'Default',          value: '' },
  { label: 'Serif',            value: 'Georgia, serif' },
  { label: 'Times New Roman',  value: '"Times New Roman", serif' },
  { label: 'Monospace',        value: '"Courier New", monospace' },
]

export const FONT_SIZES = [
  { label: 'Default', value: '' },
  { label: '10',  value: '10px' },
  { label: '12',  value: '12px' },
  { label: '13',  value: '13px' },
  { label: '14',  value: '14px' },
  { label: '16',  value: '16px' },
  { label: '18',  value: '18px' },
  { label: '20',  value: '20px' },
  { label: '24',  value: '24px' },
  { label: '28',  value: '28px' },
  { label: '32',  value: '32px' },
  { label: '36',  value: '36px' },
  { label: '48',  value: '48px' },
]

export const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Red',     value: '#ef4444' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Green',   value: '#22c55e' },
  { label: 'Cyan',    value: '#06b6d4' },
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Violet',  value: '#7c6af7' },
  { label: 'Pink',    value: '#ec4899' },
  { label: 'White',   value: '#ffffff' },
  { label: 'Gray',    value: '#6b7280' },
  { label: 'Dark',    value: '#1f2937' },
]
