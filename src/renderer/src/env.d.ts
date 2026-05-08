export type { DocMeta, DocRow } from '@shared/types'

export type GitCommit = { hash: string; message: string; date: string; author: string }

export type GitStatus = {
  branch: string; clean: boolean; files: number
  commits: GitCommit[]; branches: string[]; currentBranch: string
}

export type Canvas = { id: string; title: string; created_at: number }

export type CanvasNode = {
  id: string
  canvas_id: string
  label: string
  type: 'skill' | 'note' | 'group'
  color: string | null
  linked_doc_id: string | null
  pos_x: number
  pos_y: number
  parent_id: string | null
  group_id: string | null
  collapsed: number  // 0 | 1
  icon: string | null
  shape: string
  width: number | null
  height: number | null
}

export type CanvasEdge = {
  id: string
  from_id: string
  to_id: string
  color: string | null
  label: string | null
  animated: number  // 0 | 1
  edge_style: string  // 'straight' | 'bezier' | 'step'
}

declare global {
  interface Window {
    api: {
      docs: {
        list: () => Promise<DocMeta[]>
        get: (id: string) => Promise<DocRow | undefined>
        create: (title: string, type: 'chapter' | 'note', parentId?: string) => Promise<DocRow>
        update: (id: string, fields: { title?: string; content?: string; sort_order?: number; word_target?: number | null; pov?: string | null; location?: string | null; scene_status?: string | null }) => Promise<boolean>
        delete: (id: string) => Promise<boolean>
        updatePosition: (id: string, x: number, y: number) => Promise<boolean>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<boolean>
        getAll: () => Promise<Record<string, string>>
      }
      canvas: {
        list: () => Promise<Canvas[]>
        create: (title: string) => Promise<Canvas>
        rename: (id: string, title: string) => Promise<boolean>
        delete: (id: string) => Promise<boolean>
        getDefault: () => Promise<string>
        listNodes: (canvasId: string) => Promise<CanvasNode[]>
        listEdges: (canvasId: string) => Promise<CanvasEdge[]>
        createNode: (canvasId: string, label: string, type: 'skill' | 'note' | 'group', posX: number, posY: number, color?: string, linkedDocId?: string, parentId?: string, width?: number, height?: number, groupId?: string) => Promise<CanvasNode>
        updateNode: (id: string, fields: Partial<Omit<CanvasNode, 'id' | 'canvas_id'>>) => Promise<boolean>
        deleteNode: (id: string) => Promise<boolean>
        restoreSnapshot: (canvasId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => Promise<boolean>
        createEdge: (fromId: string, toId: string, color?: string) => Promise<CanvasEdge>
        updateEdge: (id: string, fields: { color?: string | null; label?: string | null; animated?: number; edge_style?: string }) => Promise<boolean>
        deleteEdge: (id: string) => Promise<boolean>
      }
      git: {
        status: () => Promise<GitStatus>
        autoCommit: () => Promise<{ committed: boolean; message: string }>
        manualCommit: (message: string) => Promise<void>
        createBranch: (name: string) => Promise<void>
        switchBranch: (name: string) => Promise<void>
        deleteBranch: (name: string) => Promise<void>
      }
      cloud: {
        signIn: (email: string, password: string) => Promise<{ email: string | null; error: string | null }>
        signOut: () => Promise<void>
        session: () => Promise<{ email: string | null; lastSync: string | null }>
        push: () => Promise<{ pushed: number; error: string | null }>
        pull: () => Promise<{ pulled: number; error: string | null }>
      }
      export: {
        manuscript: () => Promise<{ saved: boolean; path?: string; error?: string }>
      }
    }
  }
}
