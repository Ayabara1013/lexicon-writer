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

async function pushToGitHub(): Promise<void> {
  const repoUrl = getSetting('github_repo')
  const pat = getSetting('github_pat')
  if (!repoUrl || !pat) return

  const g = assertReady()
  const cleanUrl = repoUrl.replace(/\.git$/, '').replace(/\/$/, '')
  const authedUrl = cleanUrl.replace(/^https:\/\//, `https://oauth2:${pat}@`) + '.git'

  const branchInfo = await g.branch().catch(() => ({ current: 'main' }))
  const branch = (branchInfo as { current: string }).current || 'main'

  try {
    const remotes = await g.getRemotes()
    if ((remotes as Array<{ name: string }>).find((r) => r.name === 'origin')) {
      await g.remote(['set-url', 'origin', authedUrl])
    } else {
      await g.addRemote('origin', authedUrl)
    }
    await g.push(['origin', branch, '--set-upstream'])
  } finally {
    // Always restore clean URL so PAT doesn't persist in .git/config
    await g.remote(['set-url', 'origin', cleanUrl + '.git']).catch(() => {})
  }
}

export async function pushGitHub(): Promise<{ pushed: boolean; error?: string }> {
  try {
    await pushToGitHub()
    return { pushed: true }
  } catch (err) {
    console.warn('[git] push failed:', err)
    return { pushed: false, error: String(err) }
  }
}

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
  pushToGitHub().catch((e) => console.warn('[git] push failed:', e))
  return { committed: true, message }
}

export async function manualCommit(message: string): Promise<void> {
  await exportDocs()
  const hasChanges = await stageAll()
  if (!hasChanges) return
  await assertReady().commit(message || `Manual save ${new Date().toLocaleString()}`)
  pushToGitHub().catch((e) => console.warn('[git] push failed:', e))
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
    currentBranch,
    repoPath
  }
}

// ── Diff / word-count / changes ────────────────────────────────────────────────

type Seg = { type: 'context' | 'add' | 'del' | 'hunk'; text: string }
type DiffFile = { path: string; title: string; segments: Seg[] }
type ParsedDiff = { files: DiffFile[]; addedWords: number; removedWords: number; wordDelta: number }

const wc = (s: string): number => s.split(/\s+/).filter(Boolean).length

// Resolve a repo file path (chapters/<id>.md) back to its doc title.
function titleForPath(path: string): string {
  const m = path.match(/(?:chapters|notes)\/(.+)\.md$/)
  if (m) {
    const d = getDoc(m[1])
    if (d) return d.title
  }
  return path.replace(/^.*\//, '')
}

// Split a --word-diff=plain body into context / add / del runs.
// Additions are wrapped {+like this+}, deletions [-like this-].
function segmentsFromBody(body: string): Seg[] {
  const out: Seg[] = []
  const re = /(\[-[\s\S]*?-\])|(\{\+[\s\S]*?\+\})/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    if (m.index > last) out.push({ type: 'context', text: body.slice(last, m.index) })
    if (m[1]) out.push({ type: 'del', text: m[1].slice(2, -2) })
    else out.push({ type: 'add', text: m[2]!.slice(2, -2) })
    last = re.lastIndex
  }
  if (last < body.length) out.push({ type: 'context', text: body.slice(last) })
  return out
}

function parseWordDiff(raw: string): ParsedDiff {
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let bodyLines: string[] = []
  const flush = (): void => {
    if (cur && bodyLines.length) cur.segments.push(...segmentsFromBody(bodyLines.join('\n')))
    bodyLines = []
  }
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      flush()
      const m = line.match(/ b\/(.+)$/)
      const path = m ? m[1] : 'file'
      cur = { path, title: titleForPath(path), segments: [] }
      files.push(cur)
      continue
    }
    if (!cur) continue
    if (/^(index |--- |\+\+\+ |old mode|new mode|similarity |dissimilarity |rename |copy |deleted file|new file|Binary files|GIT binary)/.test(line)) continue
    if (line.startsWith('@@')) {
      flush()
      cur.segments.push({ type: 'hunk', text: line })
      continue
    }
    bodyLines.push(line)
  }
  flush()

  let addedWords = 0
  let removedWords = 0
  for (const f of files) {
    for (const s of f.segments) {
      if (s.type === 'add') addedWords += wc(s.text)
      else if (s.type === 'del') removedWords += wc(s.text)
    }
  }
  return { files, addedWords, removedWords, wordDelta: addedWords - removedWords }
}

// Net words added minus removed for a single word-diff body (used for log badges).
function netWordDelta(body: string): number {
  let add = 0
  let del = 0
  let m: RegExpExecArray | null
  const reA = /\{\+([\s\S]*?)\+\}/g
  while ((m = reA.exec(body))) add += wc(m[1])
  const reD = /\[-([\s\S]*?)-\]/g
  while ((m = reD.exec(body))) del += wc(m[1])
  return add - del
}

const COMMIT_SEP = '__LXW_COMMIT__'

// Map short-hash → net word delta for recent commits, in one git call.
function deltaMapFromLog(raw: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const chunk of raw.split(COMMIT_SEP).slice(1)) {
    const nl = chunk.indexOf('\n')
    if (nl < 0) continue
    const full = chunk.slice(0, nl).trim()
    if (!full) continue
    out[full.slice(0, 7)] = netWordDelta(chunk.slice(nl + 1))
  }
  return out
}

export async function getWordDeltas(): Promise<Record<string, number>> {
  const g = assertReady()
  if (!(await hasCommits())) return {}
  const raw = await g.raw([
    'log', '--max-count=50', '--word-diff=plain', '--no-color',
    `--format=${COMMIT_SEP}%H`, '--', 'chapters', 'notes'
  ]).catch(() => '')
  return deltaMapFromLog(raw)
}

export async function getCommitDiff(
  hash: string
): Promise<ParsedDiff & { hash: string; message: string; date: string; author: string }> {
  const g = assertReady()
  const raw = await g.raw([
    'show', hash, '--word-diff=plain', '--no-color', '--format=%H%n%an%n%aI%n%s'
  ]).catch(() => '')
  const lines = raw.split('\n')
  const [fullHash = hash, author = '', dateISO = '', subject = ''] = lines
  const body = lines.slice(4).join('\n')
  const parsed = parseWordDiff(body)
  return { ...parsed, hash: fullHash.slice(0, 7), message: subject, date: dateISO, author }
}

export async function getChanges(): Promise<{
  files: { path: string; title: string; status: 'new' | 'modified' | 'deleted' }[]
  diff: ParsedDiff
}> {
  const g = assertReady()
  await exportDocs()
  // intent-to-add so brand-new chapters show up in the diff too
  await g.add(['-N', '--', 'chapters', 'notes']).catch(() => {})

  const status = await g.status()
  const files: { path: string; title: string; status: 'new' | 'modified' | 'deleted' }[] = []
  const seen = new Set<string>()
  const add = (path: string, st: 'new' | 'modified' | 'deleted'): void => {
    if (seen.has(path)) return
    seen.add(path)
    files.push({ path, title: titleForPath(path), status: st })
  }
  status.created.forEach((p) => add(p, 'new'))
  status.not_added.forEach((p) => add(p, 'new'))
  status.deleted.forEach((p) => add(p, 'deleted'))
  status.modified.forEach((p) => add(p, 'modified'))
  status.renamed.forEach((r) => add(r.to, 'modified'))

  const raw = await g.raw(['diff', 'HEAD', '--word-diff=plain', '--no-color']).catch(() => '')
  return { files, diff: parseWordDiff(raw) }
}

export async function getDocHistory(docId: string): Promise<{
  docTitle: string
  commits: Array<{ hash: string; message: string; date: string; author: string; wordDelta: number }>
}> {
  const g = assertReady()
  const doc = getDoc(docId)
  const folder = doc?.type === 'note' ? 'notes' : 'chapters'
  const path = `${folder}/${docId}.md`
  const docTitle = doc?.title ?? docId
  if (!(await hasCommits())) return { docTitle, commits: [] }

  const rawDeltas = await g.raw([
    'log', '--max-count=50', '--word-diff=plain', '--no-color',
    `--format=${COMMIT_SEP}%H`, '--', path
  ]).catch(() => '')
  const deltas = deltaMapFromLog(rawDeltas)

  const logRes = await g.log({ maxCount: 50, file: path }).catch(() => null)
  const commits = (logRes?.all ?? []).map((c) => ({
    hash: c.hash.slice(0, 7),
    message: c.message,
    date: c.date,
    author: c.author_name,
    wordDelta: deltas[c.hash.slice(0, 7)] ?? 0
  }))
  return { docTitle, commits }
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
