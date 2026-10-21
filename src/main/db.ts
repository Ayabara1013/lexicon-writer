import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Canvas, CanvasNode, CanvasEdge, CanvasNodeInit, CanvasNodeFields, CanvasEdgeFields, EdgeKind, NodePosition } from '../../shared/types'

export type { Canvas, CanvasNode, CanvasEdge }

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
  // Talent tree: ranks, costs, unlock rules, typed links
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN description TEXT') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN max_rank INTEGER NOT NULL DEFAULT 1') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN point_cost INTEGER NOT NULL DEFAULT 1') } catch {}
  try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN requirements TEXT') } catch {}
  try { db.exec("ALTER TABLE canvas_nodes ADD COLUMN prereq_mode TEXT NOT NULL DEFAULT 'all'") } catch {}
  try { db.exec('ALTER TABLE canvas_edges ADD COLUMN min_rank INTEGER NOT NULL DEFAULT 1') } catch {}
  try {
    db.exec("ALTER TABLE canvas_edges ADD COLUMN kind TEXT NOT NULL DEFAULT 'related'")
    // First run only: links that mirror a parent → child relationship were drawn as
    // "this unlocks that", so treat them as prerequisites.
    db.exec(`
      UPDATE canvas_edges SET kind = 'prereq'
      WHERE EXISTS (SELECT 1 FROM canvas_nodes t WHERE t.id = canvas_edges.to_id AND t.parent_id = canvas_edges.from_id)
    `)
  } catch {}
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
  writeRow('canvases', canvas, 'upsert')
}

export function upsertCanvasNodeFromCloud(node: CanvasNode): void {
  writeRow('canvas_nodes', node, 'upsert')
}

export function upsertCanvasEdgeFromCloud(edge: CanvasEdge): void {
  writeRow('canvas_edges', edge, 'upsert')
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

// Generic row helpers — driven by the table's real column list, so new columns
// round-trip through undo snapshots and cloud sync without hand-written SQL.

const columnCache = new Map<string, { name: string; notnull: boolean }[]>()

function tableColumns(table: string): { name: string; notnull: boolean }[] {
  let cols = columnCache.get(table)
  if (!cols) {
    cols = (db.pragma(`table_info(${table})`) as { name: string; notnull: number }[])
      .map((c) => ({ name: c.name, notnull: c.notnull === 1 }))
    columnCache.set(table, cols)
  }
  return cols
}

function toSqlValue(v: unknown): unknown {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  return v
}

// Skips keys the table doesn't have (e.g. cloud-only owner_id) and nulls in NOT NULL
// columns, so the column default applies to rows written before the column existed.
function writeRow(table: string, row: object, mode: 'insert' | 'upsert'): void {
  const r = row as Record<string, unknown>
  const names = tableColumns(table)
    .filter((c) => r[c.name] !== undefined && !(r[c.name] === null && c.notnull))
    .map((c) => c.name)
  let sql = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
  if (mode === 'upsert') {
    sql += ` ON CONFLICT(id) DO UPDATE SET ${names.filter((n) => n !== 'id').map((n) => `${n} = excluded.${n}`).join(', ')}`
  }
  db.prepare(sql).run(...names.map((n) => toSqlValue(r[n])))
}

function updateRow(table: string, editable: readonly string[], id: string, fields: object): void {
  const f = fields as Record<string, unknown>
  const keys = editable.filter((k) => f[k] !== undefined)
  if (keys.length === 0) return
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => toSqlValue(f[k])), id)
}

const NODE_EDITABLE = [
  'label', 'type', 'color', 'linked_doc_id', 'pos_x', 'pos_y', 'parent_id', 'group_id',
  'collapsed', 'icon', 'shape', 'width', 'height',
  'description', 'max_rank', 'point_cost', 'requirements', 'prereq_mode',
] as const
const EDGE_EDITABLE = ['color', 'label', 'animated', 'edge_style', 'kind', 'min_rank'] as const

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

export function createCanvasNode(canvasId: string, init: CanvasNodeInit): CanvasNode {
  const id = randomUUID()
  writeRow('canvas_nodes', { ...init, id, canvas_id: canvasId, collapsed: 0 }, 'insert')
  return getCanvasNode(id)!
}

export function updateCanvasNode(id: string, fields: CanvasNodeFields): void {
  updateRow('canvas_nodes', NODE_EDITABLE, id, fields)
}

export function updateCanvasPositions(positions: NodePosition[]): void {
  db.transaction(() => {
    for (const p of positions) updateRow('canvas_nodes', NODE_EDITABLE, p.id, { pos_x: p.pos_x, pos_y: p.pos_y, width: p.width, height: p.height })
  })()
}

export function deleteCanvasNode(id: string): void {
  const now = Date.now()
  db.transaction(() => {
    db.prepare('UPDATE canvas_edges SET deleted_at = ? WHERE from_id = ? OR to_id = ?').run(now, id, id)
    db.prepare('UPDATE canvas_nodes SET deleted_at = ? WHERE id = ?').run(now, id)
    // Soft delete doesn't fire ON DELETE SET NULL, so orphan sub-nodes by hand
    db.prepare('UPDATE canvas_nodes SET parent_id = NULL WHERE parent_id = ?').run(id)
  })()
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

export function createCanvasEdge(fromId: string, toId: string, color?: string | null, kind: EdgeKind = 'related'): CanvasEdge {
  const id = randomUUID()
  db.prepare('INSERT INTO canvas_edges (id, from_id, to_id, color, kind) VALUES (?, ?, ?, ?, ?)').run(id, fromId, toId, color ?? null, kind)
  return getCanvasEdge(id)!
}

export function updateCanvasEdge(id: string, fields: CanvasEdgeFields): void {
  updateRow('canvas_edges', EDGE_EDITABLE, id, fields)
}

export function deleteCanvasEdge(id: string): void {
  db.prepare('UPDATE canvas_edges SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
}

export function restoreCanvasSnapshot(canvasId: string, nodes: CanvasNode[], edges: CanvasEdge[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM canvas_edges WHERE from_id IN (SELECT id FROM canvas_nodes WHERE canvas_id = ?)').run(canvasId)
    db.prepare('DELETE FROM canvas_nodes WHERE canvas_id = ?').run(canvasId)
    // Nodes reference each other (parent_id / group_id) in no particular order
    db.pragma('defer_foreign_keys = ON')
    const ids = new Set(nodes.map((n) => n.id))
    for (const n of nodes) {
      writeRow('canvas_nodes', {
        ...n,
        parent_id: n.parent_id && ids.has(n.parent_id) ? n.parent_id : null,
        group_id: n.group_id && ids.has(n.group_id) ? n.group_id : null,
      }, 'insert')
    }
    for (const e of edges) writeRow('canvas_edges', e, 'insert')
  })()
}
