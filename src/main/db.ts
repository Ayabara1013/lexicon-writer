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

// CRUD

export function listDocs(): DocMeta[] {
  return db.prepare('SELECT id, title, type, created_at, updated_at FROM documents ORDER BY type, created_at ASC').all() as DocMeta[]
}

export function getDoc(id: string): DocRow | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocRow | undefined
}

export function createDoc(title: string, type: 'chapter' | 'note'): DocRow {
  const id = randomUUID()
  const now = Date.now()
  db.prepare('INSERT INTO documents (id, title, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, type, '', now, now)
  return getDoc(id)!
}

export function updateDoc(id: string, fields: { title?: string; content?: string }): void {
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]
  if (fields.title !== undefined) { sets.push('title = ?'); values.push(fields.title) }
  if (fields.content !== undefined) { sets.push('content = ?'); values.push(fields.content) }
  values.push(id)
  db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteDoc(id: string): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}
