import { useState, useEffect, useCallback } from 'react'
import type { GitStatus } from '../env'

export default function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    refresh()
  }, [refresh])

  // If git isn't ready yet, retry automatically
  useEffect(() => {
    if (!error) return
    const t = setTimeout(refresh, 2000)
    return () => clearTimeout(t)
  }, [error, refresh])

  async function handleManualCommit() {
    if (!commitMsg.trim()) return
    setCommitting(true)
    try {
      await window.api.git.manualCommit(commitMsg.trim())
      setCommitMsg('')
      await refresh()
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
      if (result.committed) await refresh()
      else setError(result.message)
    } catch (e) {
      setError(String(e))
    } finally {
      setCommitting(false)
    }
  }

  async function handleSwitchBranch(name: string) {
    if (name === status?.currentBranch) return
    try {
      await window.api.git.switchBranch(name)
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleCreateBranch() {
    const name = newBranch.trim().replace(/\s+/g, '-')
    if (!name) return
    try {
      await window.api.git.createBranch(name)
      setNewBranch('')
      setShowNewBranch(false)
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleDeleteBranch(name: string) {
    if (name === status?.currentBranch) return
    try {
      await window.api.git.deleteBranch(name)
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-base-content/30 text-sm">
      Loading history…
    </div>
  )

  if (error) return (
    <div className="flex-1 p-4 text-error text-xs font-mono">
      <p className="font-semibold mb-1">Git error</p>
      <p className="opacity-70">{error}</p>
      <button onClick={refresh} className="mt-3 btn btn-xs btn-outline">Retry</button>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-0">

      {/* Branch bar */}
      <section className="px-4 py-3 border-b border-base-300">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">Branches</span>
          <button
            onClick={() => setShowNewBranch((v) => !v)}
            className="text-xs text-primary/60 hover:text-primary transition-colors"
          >
            + New
          </button>
        </div>

        {showNewBranch && (
          <div className="flex gap-1 mb-2">
            <input
              autoFocus
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false) }}
              placeholder="branch-name"
              className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-base-300 text-base-content outline-none font-mono"
            />
            <button onClick={handleCreateBranch} className="btn btn-xs btn-primary">Create</button>
          </div>
        )}

        <div className="space-y-0.5">
          {status?.branches.map((b) => (
            <div key={b} className="group flex items-center gap-1">
              <button
                onClick={() => handleSwitchBranch(b)}
                className={`flex-1 text-left text-xs px-2 py-1.5 rounded font-mono transition-colors truncate ${
                  b === status.currentBranch
                    ? 'bg-primary/20 text-primary'
                    : 'text-base-content/60 hover:bg-base-300 hover:text-base-content'
                }`}
              >
                {b === status.currentBranch && <span className="mr-1">●</span>}{b}
              </button>
              {b !== status.currentBranch && (
                <button
                  onClick={() => handleDeleteBranch(b)}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[10px] text-base-content/30 hover:text-error hover:bg-error/10 transition-all"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Commit actions */}
      <section className="px-4 py-3 border-b border-base-300">
        <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Save Snapshot</div>
        <div className="flex gap-1 mb-2">
          <input
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleManualCommit() }}
            placeholder="Describe this snapshot…"
            className="flex-1 min-w-0 px-2 py-1.5 rounded text-xs bg-base-300 text-base-content outline-none"
          />
          <button
            onClick={handleManualCommit}
            disabled={!commitMsg.trim() || committing}
            className="btn btn-xs btn-outline btn-primary flex-shrink-0"
          >
            Save
          </button>
        </div>
        <button
          onClick={handleAiCommit}
          disabled={committing}
          className="w-full btn btn-xs btn-primary"
        >
          {committing ? 'Saving…' : '⚡ AI Auto-Snapshot'}
        </button>
        {!status?.clean && (
          <p className="text-[10px] text-warning/70 mt-1.5 text-center">
            {status?.files} unsaved change{status?.files !== 1 ? 's' : ''}
          </p>
        )}
      </section>

      {/* Commit history */}
      <section className="px-4 py-3 flex-1">
        <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">History</div>
        {status?.commits.length === 0 ? (
          <p className="text-xs text-base-content/30 text-center py-4">No snapshots yet</p>
        ) : (
          <div className="space-y-1">
            {status?.commits.map((c) => (
              <div key={c.hash} className="px-2 py-2 rounded hover:bg-base-300 transition-colors">
                <p className="text-xs text-base-content/80 leading-snug">{c.message}</p>
                <p className="text-[10px] text-base-content/30 mt-0.5 font-mono">
                  {c.hash} · {new Date(c.date).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
