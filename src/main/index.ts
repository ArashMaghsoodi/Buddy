import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { createMainWindow, createCompanionWindow, expandCompanion, showCompanionFabQuietly, toggleCompanionMode } from './windows'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpcHandlers } from './ipcHandlers'
import { getSettings } from './store'
import { contextManager } from './contextManager'

const appIconPath = process.env.NODE_ENV === 'development'
  ? join(app.getAppPath(), 'resources', 'icon.ico')
  : join(process.resourcesPath, 'icon.ico')

const trayIconPath = process.env.NODE_ENV === 'development'
  ? join(app.getAppPath(), 'resources', 'tray-icon.png')
  : join(process.resourcesPath, 'tray-icon.png')

const appIcon = nativeImage.createFromPath(appIconPath)
const trayIcon = nativeImage.createFromPath(trayIconPath)

let tray: Tray | null = null
let isAppQuitting = false

function createTray(): void {
  tray = new Tray(trayIcon)
  tray.setToolTip('Buddy — your screen companion')

  const openBuddy = (): void => {
    const win = createMainWindow()
    if (!win.isVisible()) win.show()
    win.focus()
  }

  const openCompanion = (): void => {
    expandCompanion()
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Open Buddy', click: openBuddy },
    { label: 'Open Companion', click: openCompanion },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isAppQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
  tray.on('click', openBuddy)
  tray.on('double-click', openBuddy)
}

function bootstrap(): void {
  registerIpcHandlers()

  const settings = getSettings()
  const mainWindow = createMainWindow()
  mainWindow.setIcon(appIcon)
  if (settings.general.startMinimized) {
    mainWindow.minimize()
  }

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // The companion window is created and shown immediately as a small,
  // always-on-top floating action button — it's the primary everyday
  // entry point, not something the user has to summon first. It never
  // steals focus on startup.
  createCompanionWindow(settings.appearance.companionAlwaysOnTop)
  showCompanionFabQuietly()

  registerHotkeys(settings)
  createTray()
}

app.setName('Buddy')

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  // Keep the app alive in the tray when the main window is closed.
})

app.on('before-quit', () => {
  isAppQuitting = true
  unregisterHotkeys()
  contextManager.clearAll()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

