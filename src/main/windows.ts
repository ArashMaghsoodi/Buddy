import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from './utils'

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null

const preloadPath = join(__dirname, '../preload/index.js')
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getCompanionWindow(): BrowserWindow | null {
  return companionWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: '#15151a',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && rendererDevServerUrl) {
    mainWindow.loadURL(rendererDevServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

const COMPANION_WIDTH = 380
const COMPANION_HEIGHT = 460

export function createCompanionWindow(alwaysOnTop: boolean): BrowserWindow {
  if (companionWindow && !companionWindow.isDestroyed()) {
    showCompanion()
    return companionWindow
  }

  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workArea

  companionWindow = new BrowserWindow({
    width: COMPANION_WIDTH,
    height: COMPANION_HEIGHT,
    x: display.workArea.x + sw - COMPANION_WIDTH - 24,
    y: display.workArea.y + sh - COMPANION_HEIGHT - 24,
    minWidth: 300,
    minHeight: 200,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    alwaysOnTop,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  companionWindow.on('closed', () => (companionWindow = null))
  companionWindow.on('blur', () => {
    // Keep it around but let the user dismiss with Escape from the renderer;
    // we don't auto-hide on blur since that fights with quick alt-tabbing.
  })

  if (is.dev && rendererDevServerUrl) {
    companionWindow.loadURL(`${rendererDevServerUrl}/companion.html`)
  } else {
    companionWindow.loadFile(join(__dirname, '../renderer/companion.html'))
  }

  return companionWindow
}

export function showCompanion(): void {
  if (!companionWindow || companionWindow.isDestroyed()) return
  companionWindow.show()
  companionWindow.focus()
}

export function toggleCompanion(alwaysOnTop: boolean): void {
  if (!companionWindow || companionWindow.isDestroyed()) {
    createCompanionWindow(alwaysOnTop)
    // give it a tick to load before showing focus request from renderer
    companionWindow?.once('ready-to-show', () => showCompanion())
    return
  }
  if (companionWindow.isVisible()) {
    companionWindow.hide()
  } else {
    showCompanion()
  }
}

export function setCompanionAlwaysOnTop(alwaysOnTop: boolean): void {
  companionWindow?.setAlwaysOnTop(alwaysOnTop, 'floating')
}
