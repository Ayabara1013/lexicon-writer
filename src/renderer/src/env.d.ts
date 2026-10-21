export type { DocMeta, DocRow } from '@shared/types'

export type GitCommit = { hash: string; message: string; date: string; author: string; wordDelta?: number }

export type GitStatus = {
  branch: string; clean: boolean; files: number
  commits: GitCommit[]; branches: string[]; currentBranch: string
  repoPath: string
}

export type DiffSegment = { type: 'context' | 'add' | 'del' | 'hunk'; text: string }
export type DiffFile = { path: string; title: string; segments: DiffSegment[] }
export type ParsedDiff = { files: DiffFile[]; addedWords: number; removedWords: number; wordDelta: number }
export type CommitDiff = ParsedDiff & { hash: string; message: string; date: string; author: string }
export type ChangedFile = { path: string; title: string; status: 'new' | 'modified' | 'deleted' }
export type ChangesResult = { files: ChangedFile[]; diff: ParsedDiff }
export type DocHistory = { docTitle: string; commits: GitCommit[] }

export type {
  Canvas, CanvasNode, CanvasEdge, CanvasNodeType, TalentType, NodeShape, NodeRequirement, EdgeKind,
  CanvasNodeInit, CanvasNodeFields, CanvasEdgeFields, NodePosition,
} from '@shared/types'
import type { Canvas, CanvasNode, CanvasEdge, CanvasNodeInit, CanvasNodeFields, CanvasEdgeFields, EdgeKind, NodePosition } from '@shared/types'

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
        createNode: (canvasId: string, init: CanvasNodeInit) => Promise<CanvasNode>
        updateNode: (id: string, fields: CanvasNodeFields) => Promise<boolean>
        updatePositions: (positions: NodePosition[]) => Promise<boolean>
        deleteNode: (id: string) => Promise<boolean>
        restoreSnapshot: (canvasId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => Promise<boolean>
        createEdge: (fromId: string, toId: string, color?: string | null, kind?: EdgeKind) => Promise<CanvasEdge>
        updateEdge: (id: string, fields: CanvasEdgeFields) => Promise<boolean>
        deleteEdge: (id: string) => Promise<boolean>
      }
      git: {
        status: () => Promise<GitStatus>
        autoCommit: () => Promise<{ committed: boolean; message: string }>
        manualCommit: (message: string) => Promise<void>
        createBranch: (name: string) => Promise<void>
        switchBranch: (name: string) => Promise<void>
        deleteBranch: (name: string) => Promise<void>
        push: () => Promise<{ pushed: boolean; error?: string }>
        commitDiff: (hash: string) => Promise<CommitDiff>
        wordDeltas: () => Promise<Record<string, number>>
        changes: () => Promise<ChangesResult>
        docHistory: (docId: string) => Promise<DocHistory>
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
