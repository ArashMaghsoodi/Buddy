import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from './utils'
import { getSettings } from './store'

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let companionMode: 'fab' | 'overlay' = 'fab'
let companionAnimation: ReturnType<typeof setInterval> | null = null

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

const FAB_SIZE = 64
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

function animateCompanionBounds(win: BrowserWindow, target: Electron.Rectangle): void {
  if (companionAnimation) clearInterval(companionAnimation)
  const start = win.getBounds()
  const duration = 180
  const startedAt = Date.now()

  if (
    start.x === target.x &&
    start.y === target.y &&
    start.width === target.width &&
    start.height === target.height
  ) {
    return
  }

  companionAnimation = setInterval(() => {
    if (win.isDestroyed()) {
      if (companionAnimation) clearInterval(companionAnimation)
      companionAnimation = null
      return
    }
    const progress = Math.min((Date.now() - startedAt) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    win.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased)
    })
    if (progress >= 1) {
      if (companionAnimation) clearInterval(companionAnimation)
      companionAnimation = null
    }
  }, 16)
}

/** Resize/reposition the companion window for the given mode and notify the renderer. */
function applyCompanionMode(mode: 'fab' | 'overlay'): void {
  const win = ensureCompanionWindow()
  if (mode === 'fab') {
    const bounds = win.getBounds()
    win.setResizable(false)
    win.setHasShadow(false)
    animateCompanionBounds(win, {
      x: bounds.x + bounds.width - FAB_SIZE,
      y: bounds.y + bounds.height - FAB_SIZE,
      width: FAB_SIZE,
      height: FAB_SIZE
    })
  } else {
    const bounds = win.getBounds()
    win.setResizable(true)
    win.setHasShadow(true)
    animateCompanionBounds(win, {
      x: bounds.x + bounds.width - OVERLAY_WIDTH,
      y: bounds.y + bounds.height - OVERLAY_HEIGHT,
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT
    })
  }
  companionMode = mode
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

// ---- Overlay → maximized window handoff ----
//
// "Open in new window" in the compact overlay needs to bring up the full
// window already showing the same conversation. If the main window isn't
// created/loaded yet, the renderer isn't ready to receive an IPC push, so
// we stash the target conversation id and let the renderer pull it once
// on mount (see `window:consume-pending-conversation`) as a fallback to
// the live push used when the window is already open.
let pendingOpenConversationId: string | null = null

export function openConversationInMainWindow(conversationId: string): void {
  const win = createMainWindow()
  win.show()
  win.focus()
  if (!conversationId) return
  if (win.webContents.isLoading()) {
    pendingOpenConversationId = conversationId
  } else {
    win.webContents.send('buddy:open-conversation', conversationId)
  }
}

export function consumePendingConversationId(): string | null {
  const id = pendingOpenConversationId
  pendingOpenConversationId = null
  return id
}
