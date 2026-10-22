import type { Canvas, CanvasEdge, CanvasNode, DocMeta, DocRow, EdgeKind } from '../env'
import { NODE_TYPE_META } from '../talent/model'

/**
 * Browser stand-in for the Electron preload bridge (window.api), used by the
 * web preview build (`npm run build:demo`). Everything lives in localStorage,
 * so work survives reloads but stays in that one browser. Git, cloud sync and
 * .docx export need the desktop app and answer with a friendly error.
 *
 * Open with `?reset` to wipe the stored data and start from the sample again.
 */

type Store = { docs: DocRow[]; settings: Record<string, string>; canvases: Canvas[]; nodes: CanvasNode[]; edges: CanvasEdge[] }

const KEY = 'lexicon-writer-demo-v1'
const DESKTOP_ONLY = 'Only available in the desktop app'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function sample(): Store {
  const now = Date.now()
  const doc = (id: string, title: string, type: 'chapter' | 'note', sort: number, content: string): DocRow => ({
    id, title, type, content, created_at: now, updated_at: now, pos_x: null, pos_y: null, parent_id: null,
    sort_order: sort, word_target: null, pov: null, location: null, scene_status: null, deleted_at: null,
  })
  const node = (id: string, label: string, type: CanvasNode['type'], x: number, y: number, extra: Partial<CanvasNode> = {}): CanvasNode => ({
    id, canvas_id: 'sample', label, type, color: null, linked_doc_id: null, pos_x: x, pos_y: y, parent_id: null, group_id: null,
    collapsed: 0, icon: null, shape: NODE_TYPE_META[type].shape, width: null, height: null, description: null,
    max_rank: 1, point_cost: 1, requirements: null, prereq_mode: 'all', deleted_at: null, ...extra,
  })
  const edge = (id: string, from_id: string, to_id: string, kind: EdgeKind, min_rank = 1): CanvasEdge => ({
    id, from_id, to_id, color: null, label: null, animated: 0, edge_style: 'straight', kind, min_rank, deleted_at: null,
  })
  return {
    docs: [
      doc('ch1', 'Chapter 1', 'chapter', 1, '<h1>Chapter 1</h1><p>This is a browser preview of Lexicon Writer. Your writing is saved in this browser only.</p>'),
      doc('kai', 'Kai — pyromancer', 'note', 2, '<p>Kai specialises in fire magic. Took Fireball at level 1 and maxed it before the tournament arc.</p>'),
    ],
    settings: { is_pro: '1' },
    canvases: [{ id: 'sample', title: 'Pyromancer (sample)', created_at: now }],
    nodes: [
      node('fireball', 'Fireball', 'skill', 0, 0, { color: '#f59e0b', icon: '🔥', max_rank: 5, description: 'Hurl a ball of fire. +20% damage per rank.' }),
      node('burning', 'Burning', 'group', -300, 120, { color: '#ef4444', width: 300, height: 340 }),
      node('ignite', 'Ignite', 'passive', 100, 60, { parent_id: 'fireball', group_id: 'burning', max_rank: 3, description: 'Fire damage sets targets ablaze.' }),
      node('int', '+5 INT', 'stat', 100, 220, { parent_id: 'ignite', group_id: 'burning' }),
      node('nova', 'Fire Nova', 'skill', 0, 170, { parent_id: 'fireball', max_rank: 3, point_cost: 2, description: 'Explode outward in a ring of flame.' }),
      node('ward', 'Ember Ward', 'skill', 160, 170, { parent_id: 'fireball', description: 'A shield of embers.' }),
      node('inferno', 'Inferno', 'keystone', 0, 340, {
        parent_id: 'nova', description: 'Capstone. Your fire spells leave burning ground.',
        requirements: JSON.stringify([{ kind: 'points_spent', scope: 'tree', min: 8 }, { kind: 'level', min: 10 }]),
      }),
      node('frost', 'Frost Armor', 'skill', 340, 0, { color: '#06b6d4', icon: '❄️', description: 'Encase yourself in ice.' }),
      node('kai-note', 'Kai — pyromancer', 'note', 380, 330, { linked_doc_id: 'kai' }),
    ],
    edges: [
      edge('e1', 'fireball', 'ignite', 'prereq'), edge('e2', 'fireball', 'nova', 'prereq', 3), edge('e3', 'fireball', 'ward', 'prereq'),
      edge('e4', 'ignite', 'int', 'prereq'), edge('e5', 'nova', 'inferno', 'prereq', 2),
      edge('e6', 'ward', 'frost', 'exclusive'), edge('e7', 'fireball', 'frost', 'synergy'), edge('e8', 'frost', 'kai-note', 'related'),
    ],
  }
}

function load(): Store {
  if (new URLSearchParams(window.location.search).has('reset')) localStorage.removeItem(KEY)
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage blocked or corrupt — fall back to the sample */ }
  return sample()
}

export function installBrowserApi(): void {
  const s = load()
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: in-memory only */ } }
  save()
  const ok = async () => { save(); return true }
  const meta = ({ content: _c, ...m }: DocRow): DocMeta => m
  const liveNodes = () => s.nodes.filter((n) => !n.deleted_at)
  const liveEdges = () => s.edges.filter((e) => !e.deleted_at)
  const nodeById = (id: string) => s.nodes.find((n) => n.id === id)
  const edgeById = (id: string) => s.edges.find((e) => e.id === id)

  window.api = {
    docs: {
      list: async () => s.docs.filter((d) => !d.deleted_at).sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at).map(meta),
      get: async (id) => clone(s.docs.find((d) => d.id === id && !d.deleted_at)),
      create: async (title, type, parentId) => {
        const now = Date.now()
        const siblings = s.docs.filter((d) => d.parent_id === (parentId ?? null))
        const d: DocRow = {
          id: uid(), title, type, content: '', created_at: now, updated_at: now, pos_x: null, pos_y: null, parent_id: parentId ?? null,
          sort_order: Math.max(0, ...siblings.map((x) => x.sort_order)) + 1, word_target: null, pov: null, location: null, scene_status: null, deleted_at: null,
        }
        s.docs.push(d); save()
        return clone(d)
      },
      update: async (id, fields) => { const d = s.docs.find((x) => x.id === id); if (d) Object.assign(d, fields, { updated_at: Date.now() }); return ok() },
      delete: async (id) => { const d = s.docs.find((x) => x.id === id); if (d) d.deleted_at = Date.now(); return ok() },
      updatePosition: async (id, x, y) => { const d = s.docs.find((v) => v.id === id); if (d) Object.assign(d, { pos_x: x, pos_y: y }); return ok() },
    },
    settings: {
      get: async (k) => s.settings[k] ?? null,
      set: async (k, v) => { s.settings[k] = v; return ok() },
      getAll: async () => ({ ...s.settings }),
    },
    canvas: {
      list: async () => clone(s.canvases.filter((c) => !c.deleted_at)),
      create: async (title) => { const c: Canvas = { id: uid(), title, created_at: Date.now() }; s.canvases.push(c); save(); return clone(c) },
      rename: async (id, title) => { const c = s.canvases.find((x) => x.id === id); if (c) c.title = title; return ok() },
      delete: async (id) => {
        const now = Date.now()
        const ids = new Set(s.nodes.filter((n) => n.canvas_id === id).map((n) => n.id))
        s.edges.forEach((e) => { if (ids.has(e.from_id)) e.deleted_at = now })
        s.nodes.forEach((n) => { if (ids.has(n.id)) n.deleted_at = now })
        const c = s.canvases.find((x) => x.id === id); if (c) c.deleted_at = now
        return ok()
      },
      getDefault: async () => {
        const live = s.canvases.find((c) => !c.deleted_at)
        if (live) return live.id
        const c: Canvas = { id: uid(), title: 'Untitled Canvas', created_at: Date.now() }
        s.canvases.push(c); save()
        return c.id
      },
      listNodes: async (canvasId) => clone(liveNodes().filter((n) => n.canvas_id === canvasId).sort((a, b) => a.label.localeCompare(b.label))),
      listEdges: async (canvasId) => {
        const ids = new Set(liveNodes().filter((n) => n.canvas_id === canvasId).map((n) => n.id))
        return clone(liveEdges().filter((e) => ids.has(e.from_id)))
      },
      createNode: async (canvasId, init) => {
        const n: CanvasNode = {
          id: uid(), canvas_id: canvasId, color: null, linked_doc_id: null, parent_id: null, group_id: null, width: null, height: null,
          shape: 'circle', collapsed: 0, icon: null, description: null, max_rank: 1, point_cost: 1, requirements: null, prereq_mode: 'all', deleted_at: null,
          ...Object.fromEntries(Object.entries(init).filter(([, v]) => v !== undefined)),
        } as CanvasNode
        s.nodes.push(n); save()
        return clone(n)
      },
      updateNode: async (id, fields) => { const n = nodeById(id); if (n) Object.assign(n, fields); return ok() },
      updatePositions: async (positions) => {
        for (const p of positions) {
          const n = nodeById(p.id)
          if (!n) continue
          n.pos_x = p.pos_x; n.pos_y = p.pos_y
          if (p.width != null) { n.width = p.width; n.height = p.height ?? n.height }
        }
        return ok()
      },
      deleteNode: async (id) => {
        const now = Date.now()
        s.edges.forEach((e) => { if (e.from_id === id || e.to_id === id) e.deleted_at = now })
        s.nodes.forEach((n) => { if (n.id === id) n.deleted_at = now; if (n.parent_id === id) n.parent_id = null })
        return ok()
      },
      restoreSnapshot: async (canvasId, nodes, edges) => {
        const ids = new Set(s.nodes.filter((n) => n.canvas_id === canvasId).map((n) => n.id))
        s.nodes = [...s.nodes.filter((n) => n.canvas_id !== canvasId), ...clone(nodes)]
        s.edges = [...s.edges.filter((e) => !ids.has(e.from_id)), ...clone(edges)]
        return ok()
      },
      createEdge: async (fromId, toId, color, kind = 'related') => {
        const e: CanvasEdge = { id: uid(), from_id: fromId, to_id: toId, color: color ?? null, label: null, animated: 0, edge_style: 'straight', kind, min_rank: 1, deleted_at: null }
        s.edges.push(e); save()
        return clone(e)
      },
      updateEdge: async (id, fields) => { const e = edgeById(id); if (e) Object.assign(e, fields); return ok() },
      deleteEdge: async (id) => { const e = edgeById(id); if (e) e.deleted_at = Date.now(); return ok() },
    },
    git: {
      status: async () => ({ branch: 'main', clean: true, files: 0, commits: [], branches: ['main'], currentBranch: 'main', repoPath: '(browser preview — no git)' }),
      autoCommit: async () => ({ committed: false, message: DESKTOP_ONLY }),
      manualCommit: async () => { throw new Error(DESKTOP_ONLY) },
      createBranch: async () => { throw new Error(DESKTOP_ONLY) },
      switchBranch: async () => { throw new Error(DESKTOP_ONLY) },
      deleteBranch: async () => { throw new Error(DESKTOP_ONLY) },
      push: async () => ({ pushed: false, error: DESKTOP_ONLY }),
      commitDiff: async (hash) => ({ hash, message: '', date: '', author: '', files: [], addedWords: 0, removedWords: 0, wordDelta: 0 }),
      wordDeltas: async () => ({}),
      changes: async () => ({ files: [], diff: { files: [], addedWords: 0, removedWords: 0, wordDelta: 0 } }),
      docHistory: async (docId) => ({ docTitle: s.docs.find((d) => d.id === docId)?.title ?? '', commits: [] }),
    },
    cloud: {
      signIn: async () => ({ email: null, error: DESKTOP_ONLY }),
      signOut: async () => {},
      session: async () => ({ email: null, lastSync: null }),
      push: async () => ({ pushed: 0, error: DESKTOP_ONLY }),
      pull: async () => ({ pulled: 0, error: DESKTOP_ONLY }),
    },
    export: {
      manuscript: async () => ({ saved: false, error: DESKTOP_ONLY }),
    },
  }
}
