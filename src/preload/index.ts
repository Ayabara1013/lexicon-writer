import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  docs: {
    list: () => ipcRenderer.invoke('docs:list'),
    get: (id: string) => ipcRenderer.invoke('docs:get', id),
    create: (title: string, type: 'chapter' | 'note') => ipcRenderer.invoke('docs:create', title, type),
    update: (id: string, fields: { title?: string; content?: string }) => ipcRenderer.invoke('docs:update', id, fields),
    delete: (id: string) => ipcRenderer.invoke('docs:delete', id)
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
