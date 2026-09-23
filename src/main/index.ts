import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { createMainWindow, createCompanionWindow, toggleCompanion, getCompanionWindow } from './windows'
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
    {
      label: 'Toggle companion',
      click: () => {
        const settings = getSettings()
        toggleCompanion(settings.appearance.companionAlwaysOnTop)
      }
    },
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

  createMainWindow()
  const settings = getSettings()
  createCompanionWindow(settings.appearance.companionAlwaysOnTop)
  getCompanionWindow()?.once('ready-to-show', () => {
    // Companion starts hidden — it appears on hotkey or explicit toggle,
    // per "do not continuously capture/upload" + "unobtrusive" requirements.
  })

  registerHotkeys(settings, () => {
    // Handled inside the companion renderer via an IPC status stream; the
    // renderer triggers the actual ask() call with captureScreen: true once
    // it receives focus, so the newest screen state is what gets captured.
    getCompanionWindow()?.webContents.send('buddy:trigger-analyze')
  })

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
