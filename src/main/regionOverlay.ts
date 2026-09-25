import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from './utils'
import type { RegionRect } from '@shared/types'

/**
 * Region-selection overlay: one frameless transparent always-on-top window
 * per display, so each renders over a single monitor. A single transparent
 * window spanning the whole virtual desktop does not composite reliably
 * across monitors on Windows (it clips to the primary), so we avoid it.
 *
 * Each overlay window is anchored to its display's bounds, so browser client
 * coords (0,0 = window origin) are local to that display. When the user
 * completes a drag, the renderer reports the rect and main converts it to
 * virtual-desktop coordinates by adding the sending window's display origin.
 */

interface OverlayEntry {
  window: BrowserWindow
  originX: number
  originY: number
}

const overlays: OverlayEntry[] = []
let pendingResolve: ((r: RegionRect | null) => void) | null = null

const preloadPath = join(__dirname, '../preload/index.js')
const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']

export function selectRegion(): Promise<RegionRect | null> {
  // Tear down any previous in-flight selection.
  if (overlays.length > 0) {
    dismissOverlay()
  }

  return new Promise((resolve) => {
    pendingResolve = resolve

    const displays = screen.getAllDisplays()
    for (const display of displays) {
      const { x, y, width, height } = display.bounds
      const overlay = new BrowserWindow({
        x,
        y,
        width,
        height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        fullscreenable: false,
        focusable: true,
        webPreferences: {
          preload: preloadPath,
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      overlay.setAlwaysOnTop(true, 'screen-saver')
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      // Local client coords -> virtual-desktop coords by adding display origin.
      overlays.push({ window: overlay, originX: x, originY: y })

      overlay.on('closed', () => {
        // Any window closing (or failing to load) cancels the whole selection.
        if (pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          releaseOverlays()
          r(null)
        }
      })

      if (is.dev && rendererDevServerUrl) {
        overlay.loadURL(`${rendererDevServerUrl}/region.html`)
      } else {
        overlay.loadFile(join(__dirname, '../renderer/region.html'))
      }
    }

    // Ensure at least the primary display is covered.
    if (overlays.length === 0) {
      pendingResolve = null
      resolve(null)
    }
  })
}

function releaseOverlays(): void {
  for (const entry of overlays) {
    if (!entry.window.isDestroyed()) {
      entry.window.destroy()
    }
  }
  overlays.length = 0
}

export function dismissOverlay(): void {
  if (pendingResolve) {
    const resolve = pendingResolve
    pendingResolve = null
    resolve(null)
  }
  releaseOverlays()
}

/**
 * Called by the region renderer when the user completes a drag. The rect is
 * in the sending window's client coords; we shift it by that window's display
 * origin into virtual-desktop coordinates.
 */
export function completeRegionSelection(
  event: { sender: Electron.WebContents },
  rect: RegionRect
): void {
  const entry = overlays.find((o) => !o.window.isDestroyed() && o.window.webContents.id === event.sender.id)
  const originX = entry?.originX ?? 0
  const originY = entry?.originY ?? 0

  const desktopRect: RegionRect = {
    x: rect.x + originX,
    y: rect.y + originY,
    width: rect.width,
    height: rect.height
  }
  if (pendingResolve) {
    const resolve = pendingResolve
    pendingResolve = null
    resolve(desktopRect)
  }
  releaseOverlays()
}
