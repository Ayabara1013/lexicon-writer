export type DocMeta = {
  id: string
  title: string
  type: 'chapter' | 'note'
  created_at: number
  updated_at: number
}

export type DocRow = DocMeta & { content: string }

declare global {
  interface Window {
    api: {
      docs: {
        list: () => Promise<DocMeta[]>
        get: (id: string) => Promise<DocRow | undefined>
        create: (title: string, type: 'chapter' | 'note') => Promise<DocRow>
        update: (id: string, fields: { title?: string; content?: string }) => Promise<boolean>
        delete: (id: string) => Promise<boolean>
      }
    }
  }
}
