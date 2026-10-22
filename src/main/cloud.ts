import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import WebSocket from 'ws'
import {
  getSetting, setSetting, deleteSetting,
  listAllDocs, getDoc, upsertDocFromCloud,
  listCanvases, upsertCanvasFromCloud,
  listCanvasNodes, listCanvasEdges,
  upsertCanvasNodeFromCloud, upsertCanvasEdgeFromCloud,
  type DocRow, type Canvas, type CanvasNode, type CanvasEdge,
} from './db'

const SUPABASE_URL = 'https://xwfrgukarxaypcnbydwj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZnJndWthcnhheXBjbmJ5ZHdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NTYsImV4cCI6MjA5MDU2NDc1Nn0.D8pp9YOSHL8HbXGNJXANqdmM0TJr9DpmSsB05j5nPas'

let supabase: SupabaseClient

export function initCloud(): void {
  const storage = {
    getItem: (key: string): string | null => {
      const v = getSetting(`supa:${key}`)
      return v === '' ? null : v
    },
    setItem: (key: string, value: string): void => { setSetting(`supa:${key}`, value) },
    removeItem: (key: string): void => { deleteSetting(`supa:${key}`) },
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: { transport: WebSocket },
  })
}

async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function cloudSignIn(email: string, password: string): Promise<{ email: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { email: data.user?.email ?? null, error: error?.message ?? null }
}

export async function cloudSignOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function cloudGetSession(): Promise<{ email: string | null; lastSync: string | null }> {
  const session = await getSession()
  return {
    email: session?.user?.email ?? null,
    lastSync: getSetting('cloud_last_sync'),
  }
}

export async function cloudPullAll(): Promise<{ pulled: number; error: string | null }> {
  const session = await getSession()
  if (!session) return { pulled: 0, error: 'Not signed in' }

  let pulled = 0

  const { data: remoteDocs, error: docsErr } = await supabase.from('lw_documents').select('*')
  if (docsErr) return { pulled: 0, error: docsErr.message }
  for (const r of remoteDocs ?? []) {
    const local = getDoc(r.id)
    if (!local || r.updated_at > local.updated_at) {
      upsertDocFromCloud(r as DocRow)
      pulled++
    }
  }

  const { data: remoteCanvases, error: canvasErr } = await supabase.from('lw_canvases').select('*')
  if (canvasErr) return { pulled, error: canvasErr.message }
  for (const r of remoteCanvases ?? []) {
    upsertCanvasFromCloud(r as Canvas)
    pulled++
  }

  const { data: remoteNodes, error: nodesErr } = await supabase.from('lw_canvas_nodes').select('*')
  if (nodesErr) return { pulled, error: nodesErr.message }
  for (const r of remoteNodes ?? []) {
    upsertCanvasNodeFromCloud(r as CanvasNode)
    pulled++
  }

  const { data: remoteEdges, error: edgesErr } = await supabase.from('lw_canvas_edges').select('*')
  if (edgesErr) return { pulled, error: edgesErr.message }
  for (const r of remoteEdges ?? []) {
    upsertCanvasEdgeFromCloud(r as CanvasEdge)
    pulled++
  }

  setSetting('cloud_last_sync', new Date().toISOString())
  return { pulled, error: null }
}

export async function cloudPushAll(): Promise<{ pushed: number; error: string | null }> {
  const session = await getSession()
  if (!session) return { pushed: 0, error: 'Not signed in' }

  const ownerId = session.user.id
  let pushed = 0

  const docs = listAllDocs()
  if (docs.length > 0) {
    const { error } = await supabase.from('lw_documents').upsert(
      docs.map((d) => ({ ...d, owner_id: ownerId }))
    )
    if (error) return { pushed, error: error.message }
    pushed += docs.length
  }

  const canvases = listCanvases()
  if (canvases.length > 0) {
    const { error } = await supabase.from('lw_canvases').upsert(
      canvases.map((c) => ({ ...c, owner_id: ownerId }))
    )
    if (error) return { pushed, error: error.message }
    pushed += canvases.length
  }

  const allNodes: CanvasNode[] = []
  const allEdges: CanvasEdge[] = []
  for (const canvas of canvases) {
    allNodes.push(...listCanvasNodes(canvas.id))
    allEdges.push(...listCanvasEdges(canvas.id))
  }

  if (allNodes.length > 0) {
    const { error } = await supabase.from('lw_canvas_nodes').upsert(
      allNodes.map((n) => ({ ...n, owner_id: ownerId }))
    )
    if (error) return { pushed, error: error.message }
    pushed += allNodes.length
  }

  if (allEdges.length > 0) {
    const { error } = await supabase.from('lw_canvas_edges').upsert(
      allEdges.map((e) => ({ ...e, owner_id: ownerId }))
    )
    if (error) return { pushed, error: error.message }
    pushed += allEdges.length
  }

  setSetting('cloud_last_sync', new Date().toISOString())
  return { pushed, error: null }
}

export async function cloudPushDoc(id: string): Promise<void> {
  const session = await getSession()
  if (!session) return
  const doc = getDoc(id)
  if (!doc) return
  await supabase.from('lw_documents').upsert({ ...doc, owner_id: session.user.id })
  setSetting('cloud_last_sync', new Date().toISOString())
}
