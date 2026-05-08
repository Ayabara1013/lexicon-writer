import { supabase } from './supabase'
import type { DocMeta, DocRow } from './types'

async function ownerId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const api = {
  docs: {
    list: async (): Promise<DocMeta[]> => {
      const { data, error } = await supabase
        .from('lw_documents')
        .select('id,title,type,created_at,updated_at,pos_x,pos_y,parent_id,sort_order,word_target,pov,location,scene_status,deleted_at')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DocMeta[]
    },

    get: async (id: string): Promise<DocRow | undefined> => {
      const { data } = await supabase
        .from('lw_documents')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      return data ?? undefined
    },

    create: async (title: string, type: 'chapter' | 'note', parentId?: string): Promise<DocRow> => {
      const uid = await ownerId()
      const id = crypto.randomUUID()
      const now = Date.now()
      const { data: maxRow } = await supabase
        .from('lw_documents')
        .select('sort_order')
        .is('deleted_at', null)
        .eq('parent_id', parentId ?? null)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sortOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1
      const doc: DocRow = {
        id, title, type, content: '', created_at: now, updated_at: now,
        pos_x: null, pos_y: null, parent_id: parentId ?? null, sort_order: sortOrder,
        word_target: null, pov: null, location: null, scene_status: null, deleted_at: null,
      }
      const { error } = await supabase.from('lw_documents').insert({ ...doc, owner_id: uid })
      if (error) throw error
      return doc
    },

    update: async (id: string, fields: Partial<Omit<DocRow, 'id' | 'created_at' | 'deleted_at'>>): Promise<boolean> => {
      const { error } = await supabase
        .from('lw_documents')
        .update({ ...fields, updated_at: Date.now() })
        .eq('id', id)
      if (error) throw error
      return true
    },

    delete: async (id: string): Promise<boolean> => {
      const now = Date.now()
      const { error } = await supabase
        .from('lw_documents')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id)
      if (error) throw error
      return true
    },

    updatePosition: async (id: string, x: number, y: number): Promise<boolean> => {
      await supabase.from('lw_documents').update({ pos_x: x, pos_y: y, updated_at: Date.now() }).eq('id', id)
      return true
    },
  },

  settings: {
    get: async (key: string): Promise<string | null> => localStorage.getItem(`lw:${key}`),
    set: async (key: string, value: string): Promise<boolean> => {
      localStorage.setItem(`lw:${key}`, value)
      return true
    },
    getAll: async (): Promise<Record<string, string>> => {
      const result: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('lw:')) result[k.slice(3)] = localStorage.getItem(k)!
      }
      return result
    },
  },
}
