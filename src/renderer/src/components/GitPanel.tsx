import { useState, useEffect, useCallback } from 'react'
import type { GitStatus, CommitDiff, ParsedDiff, ChangesResult, DiffSegment, DocHistory, GitCommit } from '../env'

type Props = {
  filterDocId?: string | null
  onClearFilter?: () => void
}

// ── Word delta badge ────────────────────────────────────────────────────────────
function WordDelta({ n }: { n: number | undefined }) {
  if (n === undefined) return <span className="text-[10px] text-base-content/20 font-mono">…</span>
  if (n === 0) return <span className="text-[10px] text-base-content/30 font-mono">±0</span>
  const pos = n > 0
  return (
    <span className="text-[10px] font-mono font-semibold" style={{ color: pos ? '#34d399' : '#f87171' }}>
      {pos ? '+' : '−'}{Math.abs(n).toLocaleString()}
    </span>
  )
}

// ── Commit-graph rail ────────────────────────────────────────────────────────────
function Rail({ isFirst, isLast, selected }: { isFirst: boolean; isLast: boolean; selected: boolean }) {
  return (
    <div style={{ width: 24, position: 'relative', flexShrink: 0, alignSelf: 'stretch' }}>
      {!isFirst && <div style={{ position: 'absolute', left: 11, top: 0, height: 14, width: 2, background: '#2a2740' }} />}
      {!isLast && <div style={{ position: 'absolute', left: 11, top: 14, bottom: 0, width: 2, background: '#2a2740' }} />}
      <div style={{
        position: 'absolute', left: 7, top: 9, width: 10, height: 10, borderRadius: '50%',
        background: selected ? '#7c6af7' : '#13111e',
        border: `2px solid ${selected ? '#9d8ef9' : '#3d357a'}`,
        boxShadow: selected ? '0 0 0 3px rgba(124,106,247,0.18)' : 'none',
        transition: 'all 0.12s',
      }} />
    </div>
  )
}

// ── Diff segment rendering ───────────────────────────────────────────────────────
function renderSegment(s: DiffSegment, i: number) {
  if (s.type === 'hunk') {
    return <span key={i} style={{ display: 'block', color: '#55507a', fontSize: 11, padding: '2px 0', margin: '10px 0', borderTop: '1px dashed #2a2740' }}>⋯</span>
  }
  if (s.type === 'add') {
    return <span key={i} style={{ background: 'rgba(52,211,153,0.16)', color: '#6ee7b7', borderRadius: 3, padding: '0 1px' }}>{s.text}</span>
  }
  if (s.type === 'del') {
    return <span key={i} style={{ background: 'rgba(248,113,113,0.13)', color: '#fca5a5', textDecoration: 'line-through', borderRadius: 3, padding: '0 1px' }}>{s.text}</span>
  }
  return <span key={i} style={{ color: '#bdb8dc' }}>{s.text}</span>
}

function DiffView({ diff, loading, emptyMsg }: { diff: ParsedDiff | CommitDiff | null; loading: boolean; emptyMsg: string }) {
  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-base-content/30 text-sm">Loading diff…</div>
  )
  if (!diff || diff.files.length === 0) return (
    <div className="flex-1 flex items-center justify-center text-base-content/25 text-sm px-10 text-center">{emptyMsg}</div>
  )
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
      {diff.files.map((f) => (
        <div key={f.path}>
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-base-300">
            <span className="text-xs font-semibold text-base-content/80 truncate">{f.title}</span>
            <span className="text-[10px] font-mono text-base-content/30 flex-shrink-0 ml-3">{f.path}</span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13.5, lineHeight: 1.7, fontFamily: "'Inter', system-ui, sans-serif" }}>
            {f.segments.map(renderSegment)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function GitPanel({ filterDocId, onClearFilter }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [githubRepo, setGithubRepo] = useState('')
  const [githubPat, setGithubPat] = useState('')
  const [editingGithub, setEditingGithub] = useState(false)
  const [githubSaved, setGithubSaved] = useState(false)

  const [tab, setTab] = useState<'history' | 'changes'>('history')
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [wordDeltas, setWordDeltas] = useState<Record<string, number>>({})
  const [changes, setChanges] = useState<ChangesResult | null>(null)
  const [changesLoading, setChangesLoading] = useState(false)
  const [docHistory, setDocHistory] = useState<DocHistory | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.git.status()
      setStatus(s)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeltas = useCallback(() => {
    window.api.git.wordDeltas().then(setWordDeltas).catch(() => {})
  }, [])

  const loadChanges = useCallback(() => {
    setChangesLoading(true)
    window.api.git.changes().then(setChanges).catch(() => setChanges(null)).finally(() => setChangesLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    loadDeltas()
    Promise.all([
      window.api.settings.get('github_repo'),
      window.api.settings.get('github_pat'),
    ]).then(([repo, pat]) => {
      setGithubRepo(repo ?? '')
      setGithubPat(pat ?? '')
    })
  }, [refresh, loadDeltas])

  // retry status until git is ready
  useEffect(() => {
    if (!error) return
    const t = setTimeout(refresh, 2000)
    return () => clearTimeout(t)
  }, [error, refresh])

  // per-chapter history filter
  useEffect(() => {
    if (!filterDocId) { setDocHistory(null); return }
    setTab('history')
    setSelectedHash(null)
    window.api.git.docHistory(filterDocId).then(setDocHistory).catch(() => setDocHistory(null))
  }, [filterDocId])

  // load changes when the Changes tab is opened
  useEffect(() => {
    if (tab === 'changes' && !filterDocId) loadChanges()
  }, [tab, filterDocId, loadChanges])

  const commitList: GitCommit[] = filterDocId ? (docHistory?.commits ?? []) : (status?.commits ?? [])

  // keep a valid commit selected as the visible list changes
  useEffect(() => {
    if (commitList.length && (!selectedHash || !commitList.some((c) => c.hash === selectedHash))) {
      setSelectedHash(commitList[0].hash)
    }
    if (!commitList.length) setSelectedHash(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDocId, docHistory, status])

  // fetch the diff for the selected commit
  useEffect(() => {
    if (!selectedHash) { setDiff(null); return }
    let cancelled = false
    setDiffLoading(true)
    window.api.git.commitDiff(selectedHash)
      .then((d) => { if (!cancelled) setDiff(d) })
      .catch(() => { if (!cancelled) setDiff(null) })
      .finally(() => { if (!cancelled) setDiffLoading(false) })
    return () => { cancelled = true }
  }, [selectedHash])

  async function saveGithub() {
    await Promise.all([
      window.api.settings.set('github_repo', githubRepo.trim()),
      window.api.settings.set('github_pat', githubPat.trim()),
    ])
    setGithubSaved(true)
    setEditingGithub(false)
    setTimeout(() => setGithubSaved(false), 2000)
  }

  async function afterCommit() {
    await refresh()
    loadDeltas()
    if (tab === 'changes') loadChanges()
  }

  async function handleManualCommit() {
    if (!commitMsg.trim()) return
    setCommitting(true)
    try {
      await window.api.git.manualCommit(commitMsg.trim())
      setCommitMsg('')
      await afterCommit()
    } catch (e) {
      setError(String(e))
    } finally {
      setCommitting(false)
    }
  }

  async function handleAiCommit() {
    setCommitting(true)
    try {
      const result = await window.api.git.autoCommit()
      if (result.committed) await afterCommit()
      else setError(result.message)
    } catch (e) {
      setError(String(e))
    } finally {
      setCommitting(false)
    }
  }

  async function handleSwitchBranch(name: string) {
    if (name === status?.currentBranch) return
    try { await window.api.git.switchBranch(name); await afterCommit() } catch (e) { setError(String(e)) }
  }

  async function handleCreateBranch() {
    const name = newBranch.trim().replace(/\s+/g, '-')
    if (!name) return
    try {
      await window.api.git.createBranch(name)
      setNewBranch('')
      setShowNewBranch(false)
      await afterCommit()
    } catch (e) { setError(String(e)) }
  }

  async function handleDeleteBranch(name: string) {
    if (name === status?.currentBranch) return
    try { await window.api.git.deleteBranch(name); await refresh() } catch (e) { setError(String(e)) }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-base-content/30 text-sm">Loading history…</div>
  )

  if (error) return (
    <div className="flex-1 p-4 text-error text-xs font-mono">
      <p className="font-semibold mb-1">Git error</p>
      <p className="opacity-70">{error}</p>
      <button onClick={refresh} className="mt-3 btn btn-xs btn-outline">Retry</button>
    </div>
  )

  const repoDisplay = githubRepo
    ? githubRepo.replace(/^https?:\/\/(github\.com\/)?/, '').replace(/\.git$/, '')
    : null

  const showingChanges = tab === 'changes' && !filterDocId
  const rightDiff: ParsedDiff | CommitDiff | null = showingChanges ? (changes?.diff ?? null) : diff
  const rightLoading = showingChanges ? changesLoading : diffLoading
  const rightEmpty = showingChanges
    ? 'No uncommitted changes — your manuscript is fully snapshotted.'
    : 'Select a snapshot to see what changed.'

  const selectedCommit = commitList.find((c) => c.hash === selectedHash)

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Left column ─────────────────────────────────────────── */}
      <div style={{ width: 380, flexShrink: 0 }} className="border-r border-base-300 flex flex-col overflow-hidden">
        <div className="overflow-y-auto flex-1">

          {filterDocId ? (
            /* Per-chapter history banner */
            <section className="px-4 py-3 border-b border-base-300 bg-base-200/40">
              <button onClick={onClearFilter} className="text-[11px] text-primary/60 hover:text-primary transition-colors mb-1.5">← All history</button>
              <div className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider">History for</div>
              <div className="text-sm font-semibold text-base-content/80 truncate">{docHistory?.docTitle ?? '…'}</div>
            </section>
          ) : (
            <>
              {/* Repo info */}
              <section className="px-4 py-3 border-b border-base-300 bg-base-200/40 space-y-2">
                <div>
                  <div className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider mb-0.5">Local Repo</div>
                  <div className="text-[10px] font-mono text-base-content/50 truncate" title={status?.repoPath}>{status?.repoPath ?? '—'}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider">GitHub Backup</div>
                    {!editingGithub && (
                      <button onClick={() => setEditingGithub(true)} className="text-[10px] text-primary/50 hover:text-primary transition-colors">
                        {githubSaved ? '✓ Saved' : repoDisplay ? 'Edit' : 'Connect'}
                      </button>
                    )}
                  </div>
                  {editingGithub ? (
                    <div className="space-y-1.5 mt-1">
                      <input autoFocus value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)}
                        placeholder="https://github.com/you/my-novel"
                        className="w-full px-2 py-1.5 rounded text-[11px] bg-base-300 text-base-content outline-none font-mono" />
                      <input type="password" value={githubPat} onChange={(e) => setGithubPat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveGithub(); if (e.key === 'Escape') setEditingGithub(false) }}
                        placeholder="ghp_••• Personal Access Token"
                        className="w-full px-2 py-1.5 rounded text-[11px] bg-base-300 text-base-content outline-none font-mono" />
                      <div className="flex gap-1">
                        <button onClick={saveGithub} className="btn btn-xs btn-primary flex-1">Save</button>
                        <button onClick={() => setEditingGithub(false)} className="btn btn-xs btn-ghost">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-base-content/50 truncate">
                      {repoDisplay ?? <span className="italic text-base-content/30">Not connected</span>}
                    </div>
                  )}
                </div>
              </section>

              {/* Branches */}
              <section className="px-4 py-3 border-b border-base-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">Branches</span>
                  <button onClick={() => setShowNewBranch((v) => !v)} className="text-xs text-primary/60 hover:text-primary transition-colors">+ New</button>
                </div>
                {showNewBranch && (
                  <div className="flex gap-1 mb-2">
                    <input autoFocus value={newBranch} onChange={(e) => setNewBranch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false) }}
                      placeholder="branch-name"
                      className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-base-300 text-base-content outline-none font-mono" />
                    <button onClick={handleCreateBranch} className="btn btn-xs btn-primary">Create</button>
                  </div>
                )}
                <div className="space-y-0.5">
                  {status?.branches.map((b) => (
                    <div key={b} className="group flex items-center gap-1">
                      <button onClick={() => handleSwitchBranch(b)}
                        className={`flex-1 text-left text-xs px-2 py-1.5 rounded font-mono transition-colors truncate ${b === status.currentBranch ? 'bg-primary/20 text-primary' : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'}`}>
                        {b === status.currentBranch && <span className="mr-1">●</span>}{b}
                      </button>
                      {b !== status.currentBranch && (
                        <button onClick={() => handleDeleteBranch(b)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[10px] text-base-content/30 hover:text-error hover:bg-error/10 transition-all">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Save snapshot */}
              <section className="px-4 py-3 border-b border-base-300">
                <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Save Snapshot</div>
                <div className="flex gap-1 mb-2">
                  <input value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualCommit() }}
                    placeholder="Describe this snapshot…"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded text-xs bg-base-300 text-base-content outline-none" />
                  <button onClick={handleManualCommit} disabled={!commitMsg.trim() || committing} className="btn btn-xs btn-outline btn-primary flex-shrink-0">Save</button>
                </div>
                <button onClick={handleAiCommit} disabled={committing} className="w-full btn btn-xs btn-primary">
                  {committing ? 'Saving…' : '⚡ AI Auto-Snapshot'}
                </button>
                {!status?.clean && (
                  <p className="text-[10px] text-warning/70 mt-1.5 text-center">{status?.files} unsaved change{status?.files !== 1 ? 's' : ''}</p>
                )}
              </section>

              {/* Tabs */}
              <div className="flex border-b border-base-300">
                {(['history', 'changes'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 text-center py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-base-content/40 border-b-2 border-transparent hover:text-base-content/70'}`}>
                    {t === 'history' ? 'History' : `Changes${changes?.files.length ? ` (${changes.files.length})` : ''}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* List body */}
          <section className="px-3 py-3">
            {showingChanges ? (
              changesLoading ? (
                <p className="text-xs text-base-content/30 text-center py-4">Scanning for changes…</p>
              ) : changes?.files.length ? (
                <div className="space-y-0.5">
                  {changes.files.map((f) => (
                    <div key={f.path} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-base-300 transition-colors">
                      <span className="text-[10px] font-mono font-bold w-9 flex-shrink-0" style={{ color: f.status === 'new' ? '#34d399' : f.status === 'deleted' ? '#f87171' : '#f59e0b' }}>
                        {f.status === 'new' ? 'NEW' : f.status === 'deleted' ? 'DEL' : 'MOD'}
                      </span>
                      <span className="text-xs text-base-content/70 truncate">{f.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-base-content/30 text-center py-6">Nothing changed since your last snapshot.</p>
              )
            ) : commitList.length === 0 ? (
              <p className="text-xs text-base-content/30 text-center py-6">No snapshots yet</p>
            ) : (
              <div>
                {commitList.map((c, i) => {
                  const selected = c.hash === selectedHash
                  const delta = filterDocId ? c.wordDelta : wordDeltas[c.hash]
                  return (
                    <button key={c.hash} onClick={() => { setTab('history'); setSelectedHash(c.hash) }} className="w-full text-left flex">
                      <Rail isFirst={i === 0} isLast={i === commitList.length - 1} selected={selected} />
                      <div className={`flex-1 min-w-0 px-2 py-1.5 my-0.5 rounded transition-colors ${selected ? 'bg-primary/15' : 'hover:bg-base-300'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs leading-snug truncate ${selected ? 'text-primary' : 'text-base-content/80'}`}>{c.message}</p>
                          <span className="flex-shrink-0 mt-px"><WordDelta n={delta} /></span>
                        </div>
                        <p className="text-[10px] text-base-content/30 mt-0.5 font-mono">{c.hash} · {new Date(c.date).toLocaleDateString()}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Right column: diff viewer ───────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b border-base-300 bg-base-200/30 flex items-center justify-between">
          {showingChanges ? (
            <>
              <div>
                <div className="text-sm font-semibold text-base-content/80">Uncommitted changes</div>
                <div className="text-[11px] text-base-content/40">What will be included in your next snapshot</div>
              </div>
              {changes && (
                <div className="text-xs font-mono flex items-center gap-3">
                  <span style={{ color: '#34d399' }}>+{changes.diff.addedWords.toLocaleString()}</span>
                  <span style={{ color: '#f87171' }}>−{changes.diff.removedWords.toLocaleString()}</span>
                  <span className="text-base-content/40">words</span>
                </div>
              )}
            </>
          ) : selectedCommit ? (
            <>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-base-content/80 truncate">{selectedCommit.message}</div>
                <div className="text-[11px] text-base-content/40 font-mono">{selectedCommit.hash} · {new Date(selectedCommit.date).toLocaleString()}</div>
              </div>
              {diff && (
                <div className="text-xs font-mono flex items-center gap-3 flex-shrink-0 ml-4">
                  <span style={{ color: '#34d399' }}>+{diff.addedWords.toLocaleString()}</span>
                  <span style={{ color: '#f87171' }}>−{diff.removedWords.toLocaleString()}</span>
                  <span className="text-base-content/40">words</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-base-content/40">Version diff</div>
          )}
        </div>
        <DiffView diff={rightDiff} loading={rightLoading} emptyMsg={rightEmpty} />
      </div>
    </div>
  )
}
