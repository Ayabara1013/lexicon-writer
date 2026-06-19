import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { randomUUID } from 'crypto'

export type DocRow = {
  id: string
  title: string
  type: 'chapter' | 'note'
  content: string
  created_at: number
  updated_at: number
  pos_x: number | null
  pos_y: number | null
  parent_id: string | null
  sort_order: number
  word_target: number | null
  pov: string | null
  location: string | null
  scene_status: string | null
  deleted_at: number | null
}

export type DocMeta = Omit<DocRow, 'content'>

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'lexicon-writer.db')
  console.log('[db] path:', dbPath)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS backup_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_count INTEGER NOT NULL,
      backed_up_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'skill',
      color TEXT,
      linked_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      parent_id TEXT REFERENCES canvas_nodes(id) ON DELETE SET NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_edges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
      color TEXT
    )
  `)

  // Migrations
  try { db.exec('ALTER TABLE documents ADD COLUMN pos_x REAL') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN pos_y REAL') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN parent_id TEXT REFERENCES documents(id) ON DELETE SET NULL') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN word_target INTEGER') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN pov TEXT') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN location TEXT') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN scene_status TEXT') } catch {}
  try { db.exec('ALTER TABLE canvas_edges ADD COLUMN label TEXT') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN icon TEXT') } catch {}
  try { db.exec("ALTER TABLE canvas_nodes ADD COLUMN shape TEXT NOT NULL DEFAULT 'circle'") } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN width REAL') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN height REAL') } catch {}
  try { db.exec('ALTER TABLE canvases ADD COLUMN updated_at INTEGER') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN group_id TEXT REFERENCES canvas_nodes(id) ON DELETE SET NULL') } catch {}
  try { db.exec('ALTER TABLE canvas_edges ADD COLUMN animated INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec("ALTER TABLE canvas_edges ADD COLUMN edge_style TEXT NOT NULL DEFAULT 'straight'") } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN deleted_at INTEGER') } catch {}
  try { db.exec('ALTER TABLE canvases ADD COLUMN deleted_at INTEGER') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN deleted_at INTEGER') } catch {}
  try { db.exec('ALTER TABLE canvas_edges ADD COLUMN deleted_at INTEGER') } catch {}
  // Backfill sort_order for existing rows that have 0
  db.exec('UPDATE documents SET sort_order = rowid WHERE sort_order = 0')

  // Default settings (only inserts if key doesn't exist)
  const defaultSettings: Record<string, string> = {
    is_pro: '1',
    license_key: '',
    ollama_url: 'http://localhost:11434',
    ollama_model: 'qwen2.5',
    git_auto_commit: '1',
    git_commit_hour: '3',
    typography_curly_quotes: '1',
    typography_em_dash: '0',
    typography_ellipsis: '1',
    focus_dim_unit: 'paragraph',
    focus_dim_step: '0.33',
    focus_dim_min: '0.05',
    github_repo: '',
    github_pat: '',
    github_branch: 'main',
  }
  const upsertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value)
  }

  seedIfEmpty()
}

function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }).c
  console.log('[db] document count:', count)
  if (count > 0) return
  try {
    seedSpellshot()
  } catch (e) {
    console.error('[db] seed failed:', e)
  }
}

function seedSpellshot(): void {
  const spellshotPath = 'C:/Users/jalla/Downloads/Spellshot(1).md'
  console.log('[db] seed: checking', spellshotPath, '→ exists:', existsSync(spellshotPath))
  if (!existsSync(spellshotPath)) return

  const raw = readFileSync(spellshotPath, 'utf-8')
  const chapters = parseChapters(raw)
  const insert = db.prepare(
    'INSERT INTO documents (id, title, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const now = Date.now()

  const insertMany = db.transaction((docs: { title: string; type: 'chapter' | 'note'; content: string }[]) => {
    docs.forEach((doc, i) => {
      insert.run(randomUUID(), doc.title, doc.type, doc.content, now + i, now + i)
    })
  })

  insertMany(chapters)
  console.log('[db] seeded', chapters.length, 'chapters')

  // Seed a couple of note stubs for key characters
  const notes = [
    { title: 'Character: Cassidy Flynn (Cash)', type: 'note' as const, content: '<p>Main protagonist. Former would-be forest ranger, spent years in a wheelchair after being hit by a car. Healed by the Arena system. Practical, dry humour, resourceful.</p>' },
    { title: 'Character: Sawyer', type: 'note' as const, content: '<p>Cash\'s companion. Nearly 18, college age. Has a magical staff ("Fledgling Staff of the Mangrove Root") that he\'s still learning to use. Curious and thoughtful despite his inexperience.</p>' },
    { title: 'World: The Arena', type: 'note' as const, content: '<p>A gladiatorial system run by aliens. Humans were "leftover" on Earth after population overgrowth. Selected participants compete in a survival arena with a game-like achievement and quest system.</p>' }
  ]

  const insertNotes = db.transaction(() => {
    notes.forEach((n, i) => {
      insert.run(randomUUID(), n.title, n.type, n.content, now + 1000 + i, now + 1000 + i)
    })
  })
  insertNotes()
}

function parseChapters(md: string): { title: string; type: 'chapter'; content: string }[] {
  // Split on chapter headings (# Chapter X or # Round X or # episode X)
  const chapterRegex = /^# (Chapter .+|Round \d+|episode .+|Boilerplates.*)$/gm
  const splits: { title: string; start: number }[] = []

  let match: RegExpExecArray | null
  while ((match = chapterRegex.exec(md)) !== null) {
    splits.push({ title: match[1].replace(/\s*\{.*?\}\s*$/, '').trim(), start: match.index + match[0].length })
  }

  return splits.map((split, i) => {
    const end = i + 1 < splits.length ? splits[i + 1].start - splits[i + 1].title.length - 4 : md.length
    const body = md.slice(split.start, end)
    return {
      title: split.title,
      type: 'chapter',
      content: mdToHtml(body)
    }
  })
}

function mdToHtml(md: string): string {
  const lines = md.split('\n')
  const parts: string[] = []
  let para: string[] = []

  const flushPara = () => {
    if (para.length > 0) {
      parts.push(`<p>${para.join(' ')}</p>`)
      para = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()

    // Skip empty lines — flush current paragraph
    if (!line) { flushPara(); continue }

    // Skip image refs, footnote defs, word count markers, table rows
    if (
      line.startsWith('![]') ||
      line.startsWith('[^') ||
      /^Wc\.\s*\d+/.test(line) ||
      line.startsWith('|') ||
      line.startsWith(':---') ||
      line.startsWith('//') ||
      line.startsWith('~~')
    ) { flushPara(); continue }

    // Headings
    if (line.startsWith('### ')) { flushPara(); parts.push(`<h3>${inlineFormat(clean(line.slice(4)))}</h3>`); continue }
    if (line.startsWith('## ')) { flushPara(); parts.push(`<h2>${inlineFormat(clean(line.slice(3)))}</h2>`); continue }
    if (line.startsWith('# ')) { flushPara(); parts.push(`<h1>${inlineFormat(clean(line.slice(2)))}</h1>`); continue }

    // HR
    if (line === '---' || line === '\u2014') { flushPara(); continue }

    // Accumulate paragraph lines
    para.push(inlineFormat(clean(line)))
  }

  flushPara()
  return parts.join('\n')
}

function clean(s: string): string {
  return s
    .replace(/\\\!/g, '!')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\*/g, '*')
    .replace(/\\\~/g, '~')
    .replace(/\[image\d+\]/g, '')
    .replace(/\[\^[\w]+\]/g, '')
    .replace(/\{#[^}]+\}/g, '')
    .trim()
}

function inlineFormat(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

// Settings

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// CRUD

export function listDocs(): DocMeta[] {
  return db.prepare(
    'SELECT id, title, type, created_at, updated_at, pos_x, pos_y, parent_id, sort_order, word_target, pov, location, scene_status FROM documents WHERE deleted_at IS NULL ORDER BY sort_order, created_at ASC'
  ).all() as DocMeta[]
}

export function listAllDocs(): DocRow[] {
  return db.prepare('SELECT * FROM documents ORDER BY sort_order, created_at ASC').all() as DocRow[]
}

export function upsertDocFromCloud(doc: DocRow): void {
  db.prepare(`
    INSERT INTO documents (id, title, type, content, created_at, updated_at, pos_x, pos_y, parent_id, sort_order, word_target, pov, location, scene_status, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, type = excluded.type, content = excluded.content,
      updated_at = excluded.updated_at, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
      parent_id = excluded.parent_id, sort_order = excluded.sort_order,
      word_target = excluded.word_target, pov = excluded.pov,
      location = excluded.location, scene_status = excluded.scene_status,
      deleted_at = excluded.deleted_at
    WHERE excluded.updated_at > documents.updated_at
  `).run(
    doc.id, doc.title, doc.type, doc.content, doc.created_at, doc.updated_at,
    doc.pos_x ?? null, doc.pos_y ?? null, doc.parent_id ?? null, doc.sort_order,
    doc.word_target ?? null, doc.pov ?? null, doc.location ?? null, doc.scene_status ?? null,
    doc.deleted_at ?? null
  )
}

export function upsertCanvasFromCloud(canvas: Canvas): void {
  db.prepare(`
    INSERT INTO canvases (id, title, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
  `).run(canvas.id, canvas.title, canvas.created_at, canvas.updated_at ?? null, canvas.deleted_at ?? null)
}

export function upsertCanvasNodeFromCloud(node: CanvasNode): void {
  db.prepare(`
    INSERT INTO canvas_nodes (id, canvas_id, label, type, color, linked_doc_id, pos_x, pos_y, parent_id, group_id, collapsed, icon, shape, width, height, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label, type = excluded.type, color = excluded.color,
      linked_doc_id = excluded.linked_doc_id, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
      parent_id = excluded.parent_id, group_id = excluded.group_id,
      collapsed = excluded.collapsed, icon = excluded.icon, shape = excluded.shape,
      width = excluded.width, height = excluded.height, deleted_at = excluded.deleted_at
  `).run(
    node.id, node.canvas_id, node.label, node.type, node.color ?? null,
    node.linked_doc_id ?? null, node.pos_x, node.pos_y,
    node.parent_id ?? null, node.group_id ?? null, node.collapsed ?? 0,
    node.icon ?? null, node.shape ?? 'circle', node.width ?? null, node.height ?? null,
    node.deleted_at ?? null
  )
}

export function upsertCanvasEdgeFromCloud(edge: CanvasEdge): void {
  db.prepare(`
    INSERT INTO canvas_edges (id, from_id, to_id, color, label, animated, edge_style, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      color = excluded.color, label = excluded.label,
      animated = excluded.animated, edge_style = excluded.edge_style,
      deleted_at = excluded.deleted_at
  `).run(
    edge.id, edge.from_id, edge.to_id, edge.color ?? null,
    edge.label ?? null, edge.animated ?? 0, edge.edge_style ?? 'straight',
    edge.deleted_at ?? null
  )
}

export function updateDocPosition(id: string, x: number, y: number): void {
  db.prepare('UPDATE documents SET pos_x = ?, pos_y = ? WHERE id = ?').run(x, y, id)
}

export function getDoc(id: string): DocRow | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocRow | undefined
}

export function createDoc(title: string, type: 'chapter' | 'note', parentId?: string): DocRow {
  const id = randomUUID()
  const now = Date.now()
  const maxRow = db.prepare('SELECT MAX(sort_order) as m FROM documents WHERE parent_id IS ?').get(parentId ?? null) as { m: number | null }
  const sortOrder = (maxRow.m ?? 0) + 1
  db.prepare(
    'INSERT INTO documents (id, title, type, content, created_at, updated_at, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title, type, '', now, now, parentId ?? null, sortOrder)
  return getDoc(id)!
}

export function updateDoc(id: string, fields: {
  title?: string; content?: string; sort_order?: number
  word_target?: number | null; pov?: string | null; location?: string | null; scene_status?: string | null
}): void {
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]
  if (fields.title !== undefined)        { sets.push('title = ?');        values.push(fields.title) }
  if (fields.content !== undefined)      { sets.push('content = ?');      values.push(fields.content) }
  if (fields.sort_order !== undefined)   { sets.push('sort_order = ?');   values.push(fields.sort_order) }
  if (fields.word_target !== undefined)  { sets.push('word_target = ?');  values.push(fields.word_target) }
  if (fields.pov !== undefined)          { sets.push('pov = ?');          values.push(fields.pov) }
  if (fields.location !== undefined)     { sets.push('location = ?');     values.push(fields.location) }
  if (fields.scene_status !== undefined) { sets.push('scene_status = ?'); values.push(fields.scene_status) }
  values.push(id)
  db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteDoc(id: string): void {
  const now = Date.now()
  db.prepare('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

// Canvas operations

// Canvas types

export type Canvas = { id: string; title: string; created_at: number; updated_at?: number | null; deleted_at?: number | null }

export type CanvasNode = {
  id: string
  canvas_id: string
  label: string
  type: 'skill' | 'note' | 'group'
  color: string | null
  linked_doc_id: string | null
  pos_x: number
  pos_y: number
  parent_id: string | null
  group_id: string | null
  collapsed: number  // 0 | 1
  icon: string | null
  shape: 'circle' | 'diamond' | 'hexagon'
  width: number | null
  height: number | null
  deleted_at: number | null
}

export type CanvasEdge = {
  id: string
  from_id: string
  to_id: string
  color: string | null
  label: string | null
  animated: number  // 0 | 1
  edge_style: string  // 'straight' | 'bezier' | 'step'
  deleted_at: number | null
}

// Canvas CRUD

export function listCanvases(): Canvas[] {
  return db.prepare('SELECT id, title, created_at FROM canvases WHERE deleted_at IS NULL ORDER BY created_at ASC').all() as Canvas[]
}

export function getOrCreateDefaultCanvas(): string {
  const existing = db.prepare('SELECT id FROM canvases WHERE deleted_at IS NULL LIMIT 1').get() as { id: string } | undefined
  if (existing) return existing.id
  const id = randomUUID()
  db.prepare('INSERT INTO canvases (id, title, created_at) VALUES (?, ?, ?)').run(id, 'Untitled Canvas', Date.now())
  return id
}

export function createCanvas(title: string): Canvas {
  const id = randomUUID()
  const now = Date.now()
  db.prepare('INSERT INTO canvases (id, title, created_at) VALUES (?, ?, ?)').run(id, title, now)
  return { id, title, created_at: now }
}

export function updateCanvas(id: string, title: string): void {
  db.prepare('UPDATE canvases SET title = ? WHERE id = ?').run(title, id)
}

export function deleteCanvas(id: string): void {
  const now = Date.now()
  db.prepare('UPDATE canvas_edges SET deleted_at = ? WHERE from_id IN (SELECT id FROM canvas_nodes WHERE canvas_id = ?)').run(now, id)
  db.prepare('UPDATE canvas_nodes SET deleted_at = ? WHERE canvas_id = ?').run(now, id)
  db.prepare('UPDATE canvases SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

// Canvas node CRUD

export function listCanvasNodes(canvasId: string): CanvasNode[] {
  return db.prepare('SELECT * FROM canvas_nodes WHERE canvas_id = ? AND deleted_at IS NULL ORDER BY label ASC').all(canvasId) as CanvasNode[]
}

export function getCanvasNode(id: string): CanvasNode | undefined {
  return db.prepare('SELECT * FROM canvas_nodes WHERE id = ?').get(id) as CanvasNode | undefined
}

export function createCanvasNode(canvasId: string, label: string, type: 'skill' | 'note' | 'group', posX = 0, posY = 0, color?: string, linkedDocId?: string, parentId?: string, width?: number, height?: number, groupId?: string): CanvasNode {
  const id = randomUUID()
  db.prepare('INSERT INTO canvas_nodes (id, canvas_id, label, type, color, linked_doc_id, pos_x, pos_y, parent_id, collapsed, width, height, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .run(id, canvasId, label, type, color ?? null, linkedDocId ?? null, posX, posY, parentId ?? null, width ?? null, height ?? null, groupId ?? null)
  return getCanvasNode(id)!
}

export function updateCanvasNode(id: string, fields: {
  label?: string; type?: 'skill' | 'note' | 'group'; color?: string | null
  linked_doc_id?: string | null; pos_x?: number; pos_y?: number
  parent_id?: string | null; group_id?: string | null; collapsed?: number
  icon?: string | null; shape?: 'circle' | 'diamond' | 'hexagon'
  width?: number | null; height?: number | null
}): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.label !== undefined)        { sets.push('label = ?');        values.push(fields.label) }
  if (fields.type !== undefined)         { sets.push('type = ?');         values.push(fields.type) }
  if (fields.color !== undefined)        { sets.push('color = ?');        values.push(fields.color) }
  if (fields.linked_doc_id !== undefined){ sets.push('linked_doc_id = ?');values.push(fields.linked_doc_id) }
  if (fields.pos_x !== undefined)        { sets.push('pos_x = ?');        values.push(fields.pos_x) }
  if (fields.pos_y !== undefined)        { sets.push('pos_y = ?');        values.push(fields.pos_y) }
  if (fields.parent_id !== undefined)    { sets.push('parent_id = ?');    values.push(fields.parent_id) }
  if (fields.group_id !== undefined)     { sets.push('group_id = ?');     values.push(fields.group_id) }
  if (fields.collapsed !== undefined)    { sets.push('collapsed = ?');    values.push(fields.collapsed) }
  if (fields.icon !== undefined)         { sets.push('icon = ?');         values.push(fields.icon) }
  if (fields.shape !== undefined)        { sets.push('shape = ?');        values.push(fields.shape) }
  if (fields.width !== undefined)        { sets.push('width = ?');        values.push(fields.width) }
  if (fields.height !== undefined)       { sets.push('height = ?');       values.push(fields.height) }
  if (sets.length === 0) return
  values.push(id)
  db.prepare(`UPDATE canvas_nodes SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteCanvasNode(id: string): void {
  const now = Date.now()
  db.prepare('UPDATE canvas_edges SET deleted_at = ? WHERE from_id = ? OR to_id = ?').run(now, id, id)
  db.prepare('UPDATE canvas_nodes SET deleted_at = ? WHERE id = ?').run(now, id)
}

// Canvas edge CRUD

export function listCanvasEdges(canvasId: string): CanvasEdge[] {
  return db.prepare(`
    SELECT e.* FROM canvas_edges e
    JOIN canvas_nodes fn ON e.from_id = fn.id
    WHERE fn.canvas_id = ? AND e.deleted_at IS NULL AND fn.deleted_at IS NULL
  `).all(canvasId) as CanvasEdge[]
}

export function getCanvasEdge(id: string): CanvasEdge | undefined {
  return db.prepare('SELECT * FROM canvas_edges WHERE id = ?').get(id) as CanvasEdge | undefined
}

export function createCanvasEdge(fromId: string, toId: string, color?: string): CanvasEdge {
  const id = randomUUID()
  db.prepare('INSERT INTO canvas_edges (id, from_id, to_id, color) VALUES (?, ?, ?, ?)').run(id, fromId, toId, color ?? null)
  return getCanvasEdge(id)!
}

export function updateCanvasEdge(id: string, fields: { color?: string | null; label?: string | null; animated?: number; edge_style?: string }): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.color !== undefined)      { sets.push('color = ?');      values.push(fields.color) }
  if (fields.label !== undefined)      { sets.push('label = ?');      values.push(fields.label) }
  if (fields.animated !== undefined)   { sets.push('animated = ?');   values.push(fields.animated) }
  if (fields.edge_style !== undefined) { sets.push('edge_style = ?'); values.push(fields.edge_style) }
  if (sets.length === 0) return
  values.push(id)
  db.prepare(`UPDATE canvas_edges SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteCanvasEdge(id: string): void {
  db.prepare('UPDATE canvas_edges SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
}

export function restoreCanvasSnapshot(canvasId: string, nodes: CanvasNode[], edges: CanvasEdge[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM canvas_edges WHERE from_id IN (SELECT id FROM canvas_nodes WHERE canvas_id = ?)').run(canvasId)
    db.prepare('DELETE FROM canvas_nodes WHERE canvas_id = ?').run(canvasId)
    const ni = db.prepare('INSERT INTO canvas_nodes (id, canvas_id, label, type, color, linked_doc_id, pos_x, pos_y, parent_id, group_id, collapsed, icon, shape, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const n of nodes) ni.run(n.id, n.canvas_id, n.label, n.type, n.color, n.linked_doc_id, n.pos_x, n.pos_y, n.parent_id, n.group_id ?? null, n.collapsed ?? 0, n.icon ?? null, n.shape ?? 'circle', n.width ?? null, n.height ?? null)
    const ei = db.prepare('INSERT INTO canvas_edges (id, from_id, to_id, color, label, animated, edge_style) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const e of edges) ei.run(e.id, e.from_id, e.to_id, e.color, e.label ?? null, e.animated ?? 0, e.edge_style ?? 'straight')
  })()
}
