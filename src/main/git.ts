import simpleGit, { type SimpleGit } from 'simple-git'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { getSetting, getAllSettings, listDocs, getDoc } from './db'

let git: SimpleGit | null = null
let repoPath: string

function assertReady(): SimpleGit {
  if (!git) throw new Error('Git not initialized yet — please wait a moment and retry.')
  return git
}

export function getRepoPath(): string {
  return repoPath
}

export async function initGit(): Promise<void> {
  repoPath = join(app.getPath('userData'), 'repo')
  mkdirSync(join(repoPath, 'chapters'), { recursive: true })
  mkdirSync(join(repoPath, 'notes'), { recursive: true })

  const g = simpleGit(repoPath)
  const isRepo = await g.checkIsRepo().catch(() => false)

  if (!isRepo) {
    await g.init()
    await g.addConfig('user.name', 'Lexicon Writer')
    await g.addConfig('user.email', 'lexicon@local')
    console.log('[git] initialized repo at', repoPath)
  } else {
    console.log('[git] repo exists at', repoPath)
  }

  git = g  // only assign once fully ready
}

// ── Doc export ────────────────────────────────────────────────────────────────

// Uses doc.id as filename so renames don't leave orphan files.
// Title + content live inside the file.
async function exportDocs(): Promise<void> {
  const docs = listDocs()
  const activeFiles = new Set<string>()

  for (const meta of docs) {
    const doc = getDoc(meta.id)
    if (!doc) continue
    const folder = doc.type === 'chapter' ? 'chapters' : 'notes'
    const fileName = `${doc.id}.md`
    activeFiles.add(join(folder, fileName))
    writeFileSync(
      join(repoPath, folder, fileName),
      `# ${doc.title}\n\n${htmlToMd(doc.content)}`,
      'utf-8'
    )
  }

  // Remove files that no longer correspond to a doc
  for (const folder of ['chapters', 'notes']) {
    const dir = join(repoPath, folder)
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.md')) continue
        if (!activeFiles.has(join(folder, f))) {
          unlinkSync(join(dir, f))
        }
      }
    } catch { /* folder may be empty */ }
  }
}

function htmlToMd(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Qwen commit message ───────────────────────────────────────────────────────

async function generateCommitMessage(diff: string): Promise<string> {
  const settings = getAllSettings()
  const ollamaUrl = settings.ollama_url ?? 'http://localhost:11434'
  const model = settings.ollama_model ?? 'qwen2.5'

  const prompt = [
    'You are a writing assistant. Given the following git diff of a fiction manuscript,',
    'write a single concise git commit message (under 72 characters) summarising what',
    'changed in the writing — focus on narrative content, not formatting.',
    'Output ONLY the commit message, no quotes, no explanation.\n\n',
    diff.slice(0, 3000)
  ].join(' ')

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false })
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as { response: string }
    return data.response.trim().replace(/^["']|["']$/g, '').slice(0, 72)
  } catch (e) {
    console.warn('[git] Ollama unavailable, using fallback message:', e)
    return `Writing session ${new Date().toLocaleDateString()}`
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hasCommits(): Promise<boolean> {
  try {
    await assertReady().log({ maxCount: 1 })
    return true
  } catch {
    return false
  }
}

async function stageAll(): Promise<boolean> {
  const g = assertReady()
  await g.add('-A')
  const status = await g.status()
  return !status.isClean()
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function autoCommit(): Promise<{ committed: boolean; message: string }> {
  const autoEnabled = getSetting('git_auto_commit') === '1'
  if (!autoEnabled) return { committed: false, message: 'auto-commit disabled' }

  await exportDocs()
  const hasChanges = await stageAll()
  if (!hasChanges) return { committed: false, message: 'nothing to commit' }

  const isPro = getSetting('is_pro') === '1'
  let message: string

  const g = assertReady()
  if (isPro) {
    const diff = await g.diff(['--cached']).catch(() => '')
    message = await generateCommitMessage(diff)
  } else {
    message = `Writing session ${new Date().toLocaleDateString()}`
  }

  await g.commit(message)
  console.log('[git] committed:', message)
  return { committed: true, message }
}

export async function manualCommit(message: string): Promise<void> {
  await exportDocs()
  const hasChanges = await stageAll()
  if (!hasChanges) return
  await assertReady().commit(message || `Manual save ${new Date().toLocaleString()}`)
}

export async function getStatus() {
  const g = assertReady()
  const status = await g.status()
  const logResult = (await hasCommits())
    ? await g.log({ maxCount: 30 }).catch(() => null)
    : null
  const commits = logResult?.all ?? []

  // branch() crashes on empty repo — fall back gracefully
  let branchList: string[] = []
  let currentBranch = status.current ?? 'main'
  try {
    const branches = await g.branch()
    branchList = branches.all.filter((b) => !b.startsWith('remotes/') && b !== 'HEAD')
    currentBranch = branches.current ?? currentBranch
  } catch { /* empty repo, no branches yet */ }

  return {
    branch: currentBranch,
    clean: status.isClean(),
    files: status.files.length,
    commits: commits.map((c) => ({
      hash: c.hash.slice(0, 7),
      message: c.message,
      date: c.date,
      author: c.author_name
    })),
    branches: branchList,
    currentBranch
  }
}

export async function createBranch(name: string): Promise<void> {
  const g = assertReady()
  if (!(await hasCommits())) {
    await exportDocs()
    await g.add('-A')
    await g.commit('Initial snapshot')
  }
  await g.checkoutLocalBranch(name)
}

export async function switchBranch(name: string): Promise<void> {
  const g = assertReady()
  await exportDocs()
  const hasChanges = await stageAll()
  if (hasChanges) {
    if (await hasCommits()) {
      await g.commit('WIP: auto-save before branch switch')
    } else {
      await g.commit('Initial snapshot')
    }
  }
  await g.checkout(name)
}

export async function deleteBranch(name: string): Promise<void> {
  await assertReady().deleteLocalBranch(name, true)
}
