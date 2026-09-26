import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { createMainWindow, createCompanionWindow, showCompanionFabQuietly, toggleCompanionMode } from './windows'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpcHandlers } from './ipcHandlers'
import { getSettings } from './store'
import { contextManager } from './contextManager'

let tray: Tray | null = null

function createTray(): void {
  // A minimal 16x16 dot icon generated at runtime so the app doesn't depend
  // on a bundled icon asset for the tray to work out of the box.
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(fallbackTrayIcon) : icon)
  tray.setToolTip('Buddy — your screen companion')
  const menu = Menu.buildFromTemplate([
    { label: 'Open Buddy', click: () => createMainWindow() },
    { label: 'Toggle companion', click: () => toggleCompanionMode() },
    { type: 'separator' },
    { label: 'Quit Buddy', role: 'quit' }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => createMainWindow())
}

// A tiny inline PNG (16x16 transparent circle) so we never depend on a
// missing icon file at first run. Replace with a real branded icon anytime.
const fallbackTrayIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR4AWMYWuD//z8DIRhVAAKjClgYRhWMKmAYVTCqgGF4KWAY0goAAKn6C/GVh1nfAAAAAElFTkSuQmCC'

function bootstrap(): void {
  registerIpcHandlers()

  const settings = getSettings()
  const mainWindow = createMainWindow()
  if (settings.general.startMinimized) {
    mainWindow.minimize()
  }

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
  // Keep running in the tray on all platforms except macOS default quit
  // behavior is inverted; Buddy targets Windows primarily, so we keep the
  // process alive for the tray + global hotkey + floating companion to
  // keep working even if the main window is closed.
  if (process.platform === 'darwin') return
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

app.on('before-quit', () => {
  unregisterHotkeys()
  contextManager.clearAll()
})
