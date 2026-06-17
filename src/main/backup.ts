import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs'
import cron from 'node-cron'
import simpleGit from 'simple-git'
import { getDb } from './db'
import type { DocRow } from './db'

const BACKUP_BRANCH = 'lexicon/nightly-backup'

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function getTotalWordCount(): number {
  const db = getDb()
  const docs = db.prepare('SELECT content FROM documents').all() as { content: string }[]
  return docs.reduce((sum, d) => sum + countWords(htmlToText(d.content)), 0)
}

function getLastBackupWordCount(): number {
  const db = getDb()
  const row = db
    .prepare('SELECT word_count FROM backup_stats ORDER BY backed_up_at DESC LIMIT 1')
    .get() as { word_count: number } | undefined
  return row?.word_count ?? 0
}

function saveBackupStats(wordCount: number): void {
  const db = getDb()
  db.prepare('INSERT INTO backup_stats (word_count, backed_up_at) VALUES (?, ?)').run(
    wordCount,
    Date.now()
  )
}

function exportDocuments(backupDir: string): void {
  const db = getDb()
  const docs = db
    .prepare('SELECT * FROM documents ORDER BY type, created_at')
    .all() as DocRow[]

  const chaptersDir = join(backupDir, 'chapters')
  const notesDir = join(backupDir, 'notes')
  mkdirSync(chaptersDir, { recursive: true })
  mkdirSync(notesDir, { recursive: true })

  for (const dir of [chaptersDir, notesDir]) {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        unlinkSync(join(dir, file))
      }
    }
  }

  for (const doc of docs) {
    const slug = doc.title
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50)
    const filename = `${slug}_${doc.id.slice(0, 8)}.md`
    const dir = doc.type === 'chapter' ? chaptersDir : notesDir
    writeFileSync(join(dir, filename), `# ${doc.title}\n\n${htmlToMarkdown(doc.content)}\n`, 'utf-8')
  }
}

export async function performNightlyBackup(): Promise<void> {
  const appPath = app.getAppPath()
  const backupDir = join(appPath, 'writing-backups')
  const git = simpleGit(appPath)

  let originalBranch = 'main'

  try {
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      console.log('[backup] not in a git repo — skipping')
      return
    }

    const status = await git.status()
    originalBranch = status.current ?? 'main'

    const totalWords = getTotalWordCount()
    const lastWords = getLastBackupWordCount()
    const wordsToday = totalWords - lastWords
    const date = new Date().toISOString().slice(0, 10)

    exportDocuments(backupDir)

    const branches = await git.branchLocal()
    if (branches.all.includes(BACKUP_BRANCH)) {
      await git.checkout(BACKUP_BRANCH)
    } else {
      await git.checkoutLocalBranch(BACKUP_BRANCH)
    }

    // Force-add so the directory is committed even if gitignored on other branches
    await git.raw(['add', '-f', 'writing-backups/'])

    const staged = await git.status()
    if (staged.staged.length > 0) {
      const wordSummary =
        wordsToday >= 0
          ? `+${wordsToday.toLocaleString()} words written`
          : `${wordsToday.toLocaleString()} net words (edits/deletions)`

      const msg =
        `Lexicon nightly backup — ${date}\n\n` +
        `${wordSummary} today  |  ${totalWords.toLocaleString()} total words`

      await git.commit(msg)
      await git.push('origin', BACKUP_BRANCH, ['--set-upstream'])
      console.log(`[backup] pushed to ${BACKUP_BRANCH} — ${wordSummary}`)
    } else {
      console.log('[backup] nothing new to commit')
    }

    await git.checkout(originalBranch)
    saveBackupStats(totalWords)
  } catch (err) {
    console.error('[backup] failed:', err)
    try {
      await simpleGit(appPath).checkout(originalBranch)
    } catch {
      // ignore cleanup failure
    }
  }
}

export function scheduleNightlyBackup(): void {
  // Runs at 23:59 every night
  cron.schedule('59 23 * * *', () => {
    console.log('[backup] starting nightly backup…')
    performNightlyBackup()
  })
  console.log('[backup] nightly backup scheduled for 23:59')
}
