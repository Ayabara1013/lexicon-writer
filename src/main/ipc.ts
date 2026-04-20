import { ipcMain } from 'electron'
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from './db'

export function setupIpc(): void {
  ipcMain.handle('docs:list', () => listDocs())
  ipcMain.handle('docs:get', (_e, id: string) => getDoc(id))
  ipcMain.handle('docs:create', (_e, title: string, type: 'chapter' | 'note') => createDoc(title, type))
  ipcMain.handle('docs:update', (_e, id: string, fields: { title?: string; content?: string }) => { updateDoc(id, fields); return true })
  ipcMain.handle('docs:delete', (_e, id: string) => { deleteDoc(id); return true })
}
