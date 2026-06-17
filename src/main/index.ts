import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb } from './db'
import { setupIpc } from './ipc'
import { scheduleNightlyBackup } from './backup'
import { initGit, autoCommit } from './git'
import { initCloud, cloudPullAll } from './cloud'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#13111e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    if (is.dev) win.webContents.openDevTools()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.greenbottle.lexicon-writer')
  try {
    initDb()
  } catch (e) {
    console.error('[db] init failed:', e)
  }
  initCloud()
  setupIpc()
  scheduleNightlyBackup()
  cloudPullAll().then((r) => {
    if (r.error) console.log('[cloud] pull skipped:', r.error)
    else if (r.pulled > 0) console.log(`[cloud] pulled ${r.pulled} records`)
  })
  initGit().then(() => {
    autoCommit().then((r) => console.log('[git] launch commit:', r.message))
    scheduleDailyCommit()
  }).catch((e) => console.error('[git] init failed:', e))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function scheduleDailyCommit(): void {
  const now = new Date()
  const targetHour = 3 // 3am
  const next = new Date(now)
  next.setHours(targetHour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  const msUntil = next.getTime() - now.getTime()
  setTimeout(() => {
    autoCommit().then((r) => console.log('[git] daily commit:', r.message))
    setInterval(() => {
      autoCommit().then((r) => console.log('[git] daily commit:', r.message))
    }, 24 * 60 * 60 * 1000)
  }, msUntil)
}
