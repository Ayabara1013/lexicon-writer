import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  docs: {
    list: () => ipcRenderer.invoke('docs:list'),
    get: (id: string) => ipcRenderer.invoke('docs:get', id),
    create: (title: string, type: 'chapter' | 'note', parentId?: string) => ipcRenderer.invoke('docs:create', title, type, parentId),
    update: (id: string, fields: { title?: string; content?: string }) => ipcRenderer.invoke('docs:update', id, fields),
    delete: (id: string) => ipcRenderer.invoke('docs:delete', id),
    updatePosition: (id: string, x: number, y: number) => ipcRenderer.invoke('docs:updatePosition', id, x, y)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  canvas: {
    list: () => ipcRenderer.invoke('canvas:list'),
    create: (title: string) => ipcRenderer.invoke('canvas:create', title),
    rename: (id: string, title: string) => ipcRenderer.invoke('canvas:rename', id, title),
    delete: (id: string) => ipcRenderer.invoke('canvas:delete', id),
    getDefault: () => ipcRenderer.invoke('canvas:getDefault'),
    listNodes: (canvasId: string) => ipcRenderer.invoke('canvas:listNodes', canvasId),
    listEdges: (canvasId: string) => ipcRenderer.invoke('canvas:listEdges', canvasId),
    createNode: (canvasId: string, label: string, type: 'skill' | 'note' | 'group', posX: number, posY: number, color?: string, linkedDocId?: string, parentId?: string, width?: number, height?: number, groupId?: string) =>
      ipcRenderer.invoke('canvas:createNode', canvasId, label, type, posX, posY, color, linkedDocId, parentId, width, height, groupId),
    updateNode: (id: string, fields: object) => ipcRenderer.invoke('canvas:updateNode', id, fields),
    deleteNode: (id: string) => ipcRenderer.invoke('canvas:deleteNode', id),
    restoreSnapshot: (canvasId: string, nodes: object[], edges: object[]) => ipcRenderer.invoke('canvas:restoreSnapshot', canvasId, nodes, edges),
    createEdge: (fromId: string, toId: string, color?: string) => ipcRenderer.invoke('canvas:createEdge', fromId, toId, color),
    updateEdge: (id: string, fields: { color?: string | null; label?: string | null }) => ipcRenderer.invoke('canvas:updateEdge', id, fields),
    deleteEdge: (id: string) => ipcRenderer.invoke('canvas:deleteEdge', id)
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    autoCommit: () => ipcRenderer.invoke('git:autoCommit'),
    manualCommit: (message: string) => ipcRenderer.invoke('git:manualCommit', message),
    createBranch: (name: string) => ipcRenderer.invoke('git:createBranch', name),
    switchBranch: (name: string) => ipcRenderer.invoke('git:switchBranch', name),
    deleteBranch: (name: string) => ipcRenderer.invoke('git:deleteBranch', name),
    push: () => ipcRenderer.invoke('git:push'),
    commitDiff: (hash: string) => ipcRenderer.invoke('git:commitDiff', hash),
    wordDeltas: () => ipcRenderer.invoke('git:wordDeltas'),
    changes: () => ipcRenderer.invoke('git:changes'),
    docHistory: (docId: string) => ipcRenderer.invoke('git:docHistory', docId),
  },
  cloud: {
    signIn: (email: string, password: string) => ipcRenderer.invoke('cloud:signIn', email, password),
    signOut: () => ipcRenderer.invoke('cloud:signOut'),
    session: () => ipcRenderer.invoke('cloud:session'),
    push: () => ipcRenderer.invoke('cloud:push'),
    pull: () => ipcRenderer.invoke('cloud:pull'),
  },
  export: {
    manuscript: () => ipcRenderer.invoke('export:manuscript'),
  },
  backup: {
    run: () => ipcRenderer.invoke('backup:run')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
