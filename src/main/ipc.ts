import { ipcMain } from 'electron'
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc, updateDocPosition, getSetting, setSetting, getAllSettings, listCanvases, createCanvas, updateCanvas, deleteCanvas, getOrCreateDefaultCanvas, listCanvasNodes, listCanvasEdges, createCanvasNode, updateCanvasNode, deleteCanvasNode, createCanvasEdge, updateCanvasEdge, deleteCanvasEdge, restoreCanvasSnapshot, type CanvasNode, type CanvasEdge } from './db'
import { autoCommit, manualCommit, getStatus, createBranch, switchBranch, deleteBranch } from './git'
import { cloudSignIn, cloudSignOut, cloudGetSession, cloudPushAll, cloudPullAll, cloudPushDoc } from './cloud'
import { exportManuscript } from './export'
import { performNightlyBackup } from './backup'

const syncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function queueDocSync(id: string): void {
  const existing = syncTimers.get(id)
  if (existing) clearTimeout(existing)
  syncTimers.set(id, setTimeout(() => {
    syncTimers.delete(id)
    cloudPushDoc(id).catch(() => {})
  }, 2000))
}

export function setupIpc(): void {
  ipcMain.handle('docs:list', () => listDocs())
  ipcMain.handle('docs:get', (_e, id: string) => getDoc(id))
  ipcMain.handle('docs:create', (_e, title: string, type: 'chapter' | 'note', parentId?: string) => createDoc(title, type, parentId))
  ipcMain.handle('docs:update', (_e, id: string, fields: Parameters<typeof updateDoc>[1]) => {
    updateDoc(id, fields)
    queueDocSync(id)
    return true
  })
  ipcMain.handle('docs:delete', (_e, id: string) => { deleteDoc(id); return true })
  ipcMain.handle('docs:updatePosition', (_e, id: string, x: number, y: number) => { updateDocPosition(id, x, y); return true })

  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => { setSetting(key, value); return true })
  ipcMain.handle('settings:getAll', () => getAllSettings())

  ipcMain.handle('canvas:list', () => listCanvases())
  ipcMain.handle('canvas:create', (_e, title: string) => createCanvas(title))
  ipcMain.handle('canvas:rename', (_e, id: string, title: string) => { updateCanvas(id, title); return true })
  ipcMain.handle('canvas:delete', (_e, id: string) => { deleteCanvas(id); return true })
  ipcMain.handle('canvas:getDefault', () => getOrCreateDefaultCanvas())
  ipcMain.handle('canvas:listNodes', (_e, canvasId: string) => listCanvasNodes(canvasId))
  ipcMain.handle('canvas:listEdges', (_e, canvasId: string) => listCanvasEdges(canvasId))
  ipcMain.handle('canvas:createNode', (_e, canvasId: string, label: string, type: 'skill' | 'note' | 'group', posX: number, posY: number, color?: string, linkedDocId?: string, parentId?: string, width?: number, height?: number) =>
    createCanvasNode(canvasId, label, type, posX, posY, color, linkedDocId, parentId, width, height)
  )
  ipcMain.handle('canvas:updateNode', (_e, id: string, fields: Parameters<typeof updateCanvasNode>[1]) => { updateCanvasNode(id, fields); return true })
  ipcMain.handle('canvas:deleteNode', (_e, id: string) => { deleteCanvasNode(id); return true })
  ipcMain.handle('canvas:createEdge', (_e, fromId: string, toId: string, color?: string) => createCanvasEdge(fromId, toId, color))
  ipcMain.handle('canvas:restoreSnapshot', (_e, canvasId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => { restoreCanvasSnapshot(canvasId, nodes, edges); return true })
  ipcMain.handle('canvas:updateEdge', (_e, id: string, fields: { color?: string | null; label?: string | null; animated?: number; edge_style?: string }) => { updateCanvasEdge(id, fields); return true })
  ipcMain.handle('canvas:deleteEdge', (_e, id: string) => { deleteCanvasEdge(id); return true })

  ipcMain.handle('git:status', () => getStatus())
  ipcMain.handle('git:autoCommit', () => autoCommit())
  ipcMain.handle('git:manualCommit', (_e, message: string) => manualCommit(message))
  ipcMain.handle('git:createBranch', (_e, name: string) => createBranch(name))
  ipcMain.handle('git:switchBranch', (_e, name: string) => switchBranch(name))
  ipcMain.handle('git:deleteBranch', (_e, name: string) => deleteBranch(name))

  ipcMain.handle('cloud:signIn', (_e, email: string, password: string) => cloudSignIn(email, password))
  ipcMain.handle('cloud:signOut', () => cloudSignOut())
  ipcMain.handle('cloud:session', () => cloudGetSession())
  ipcMain.handle('cloud:push', () => cloudPushAll())
  ipcMain.handle('cloud:pull', () => cloudPullAll())

  ipcMain.handle('export:manuscript', () => exportManuscript())
  ipcMain.handle('backup:run', () => performNightlyBackup())
}
