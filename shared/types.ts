export type DocMeta = {
  id: string
  title: string
  type: 'chapter' | 'note'
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

export type DocRow = DocMeta & { content: string }
