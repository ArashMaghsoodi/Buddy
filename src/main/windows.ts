import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from './utils'
import { getSettings } from './store'

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let companionMode: 'fab' | 'overlay' = 'fab'

const preloadPath = join(__dirname, '../preload/index.js')
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getCompanionWindow(): BrowserWindow | null {
  return companionWindow
}

export function getCompanionMode(): 'fab' | 'overlay' {
  return companionMode
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

// ---- Floating companion: a single window with two states ----
//
// Rather than two separate windows, the companion is one frameless,
// transparent, always-on-top window that we resize/reposition between a
// small circular FAB (the default, always-visible, "primary everyday
// interaction" state) and a compact chat overlay. This keeps a single
// source of truth for window state and means the renderer never has to
// coordinate handoff between windows — it just re-renders based on the
// current mode, pushed over IPC.

const FAB_SIZE = 60
const OVERLAY_WIDTH = 380
const OVERLAY_HEIGHT = 520
const EDGE_MARGIN = 24

function anchorBottomRight(win: BrowserWindow, width: number, height: number): void {
  const display = screen.getPrimaryDisplay()
  const { workArea } = display
  win.setBounds({
    x: Math.round(workArea.x + workArea.width - width - EDGE_MARGIN),
    y: Math.round(workArea.y + workArea.height - height - EDGE_MARGIN),
    width,
    height
  })
}

export function createCompanionWindow(alwaysOnTop: boolean): BrowserWindow {
  if (companionWindow && !companionWindow.isDestroyed()) {
    return companionWindow
  }

  const display = screen.getPrimaryDisplay()
  const { workArea } = display

  companionWindow = new BrowserWindow({
    width: FAB_SIZE,
    height: FAB_SIZE,
    x: Math.round(workArea.x + workArea.width - FAB_SIZE - EDGE_MARGIN),
    y: Math.round(workArea.y + workArea.height - FAB_SIZE - EDGE_MARGIN),
    minWidth: FAB_SIZE,
    minHeight: FAB_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  companionMode = 'fab'
  companionWindow.on('closed', () => (companionWindow = null))

  if (is.dev && rendererDevServerUrl) {
    companionWindow.loadURL(`${rendererDevServerUrl}/companion.html`)
  } else {
    companionWindow.loadFile(join(__dirname, '../renderer/companion.html'))
  }

  return companionWindow
}

function ensureCompanionWindow(): BrowserWindow {
  if (!companionWindow || companionWindow.isDestroyed()) {
    const alwaysOnTop = getSettings().appearance.companionAlwaysOnTop
    return createCompanionWindow(alwaysOnTop)
  }
  return companionWindow
}

/** Resize/reposition the companion window for the given mode and notify the renderer. */
function applyCompanionMode(mode: 'fab' | 'overlay'): void {
  const win = ensureCompanionWindow()
  companionMode = mode
  if (mode === 'fab') {
    win.setResizable(false)
    win.setHasShadow(false)
    anchorBottomRight(win, FAB_SIZE, FAB_SIZE)
  } else {
    win.setResizable(true)
    win.setHasShadow(true)
    anchorBottomRight(win, OVERLAY_WIDTH, OVERLAY_HEIGHT)
  }
  win.webContents.send('buddy:companion-mode', mode)
}

/** Show the FAB at startup without stealing focus from whatever the user is doing. */
export function showCompanionFabQuietly(): void {
  const win = ensureCompanionWindow()
  applyCompanionMode('fab')
  win.showInactive()
}

export function expandCompanion(): void {
  const win = ensureCompanionWindow()
  applyCompanionMode('overlay')
  win.show()
  win.focus()
}

export function collapseCompanion(): void {
  const win = ensureCompanionWindow()
  applyCompanionMode('fab')
  win.show()
}

export function toggleCompanionMode(): void {
  if (companionMode === 'fab') expandCompanion()
  else collapseCompanion()
}

export function hideCompanionWindow(): void {
  companionWindow?.hide()
}

export function setCompanionAlwaysOnTop(alwaysOnTop: boolean): void {
  companionWindow?.setAlwaysOnTop(alwaysOnTop, 'floating')
}
