import { desktopCapturer, screen, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import type { AppSettings, CaptureOutcome, CaptureRequest, RegionRect } from '@shared/types'

interface DesktopSource {
  id: string
  name: string
  display_id: string
}

/**
 * Unified capture layer. Every capture mode routes through executeCapture,
 * which returns a CaptureOutcome whose pixels are always produced by
 * desktopCapturer (the native OS window-capture mechanism) — so the image
 * matches exactly what the user sees on the selected monitor, window, or
 * region. Downstream code (ipc handlers, context manager, renderer) never
 * needs to know how the image was obtained.
 */

/**
 * The physical (points × scaleFactor) size of the primary display, used as
 * the desktopCapturer thumbnail size cap so captures are not downsampled
 * below the user's actual resolution.
 */
function defaultThumbSize(): { width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  const scale = display.scaleFactor || 1
  return {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale)
  }
}

/**
 * Best-effort query of the currently focused ("foreground") window title on
 * Windows. This only identifies which window is focused — it never captures
 * pixels — so the resulting image still comes from desktopCapturer and
 * matches what the user sees. Non-fatal: any failure resolves to null and
 * the caller falls back to the source-ordering heuristic.
 */
function getForegroundWindowTitle(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null)
      return
    }
    const script = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class BuddyWin32 {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);',
      '}',
      '"@',
      '$h = [BuddyWin32]::GetForegroundWindow()',
      'if ($h -eq [IntPtr]::Zero) { exit 0 }',
      '$sb = New-Object System.Text.StringBuilder 512',
      '[void][BuddyWin32]::GetWindowTextW($h, $sb, $sb.Capacity)',
      'Write-Output $sb.ToString()'
    ].join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const title = stdout.trim()
        resolve(title || null)
      }
    )
  })
}

function captureError(message: string): Error {
  return new Error(message)
}

/** Fetch the full-resolution screen sources and find the one for a display.

  On Windows, Electron's display.id is an internal integer but
  desktopCapturer source.display_id is a Windows device-string
  (e.g. "\\.\DISPLAY2"). Neither can be directly compared.
  The only reliable cross-platform match is physical dimensions:
  source thumbnail size vs display.size * scaleFactor.
*/
async function grabScreenSource(
  display: Electron.Display,
  displayId: string | null
): Promise<{ thumbnail: Electron.NativeImage; id: string }> {
  const thumbSize = {
    width: Math.round(display.size.width * (display.scaleFactor || 1)),
    height: Math.round(display.size.height * (display.scaleFactor || 1))
  }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbSize })

  // Try exact display.id match first (works on macOS).
  const displayKey = String(display.id)
  let target = sources.find((s) => s.display_id === displayKey)
  if (target) return validateAndReturn(target)

  // Fallback: match by physical pixel dimensions plus enumeration position.
  // On Windows both screen.getAllDisplays() and desktopCapturer screen
  // sources enumerate monitors in the same primary-first order, so the Nth
  // display corresponds to the Nth source. Physical size alone can tie when
  // two monitors share resolution/scale; position breaks that tie.
  if (sources.length > 0) {
    const targetPhysicalW = display.size.width * display.scaleFactor
    const targetPhysicalH = display.size.height * display.scaleFactor
    // Allow ±2px tolerance for rounding differences.
    const sizeMatches = sources
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const ts = s.thumbnail.getSize()
        return Math.abs(ts.width - targetPhysicalW) <= 2 && Math.abs(ts.height - targetPhysicalH) <= 2
      })
      .sort((a, b) => a.i - b.i) // preserve desktopCapturer order
    const displayIndex = screen.getAllDisplays().findIndex((d) => d.id === display.id)
    const match = displayIndex >= 0 ? sizeMatches[displayIndex] ?? sizeMatches[0] : sizeMatches[0]
    if (match) return validateAndReturn(match.s)
  }

  throw captureError('No screen source available to capture. Check screen recording permissions.')
}

function validateAndReturn(target: Electron.DesktopCapturerSource): { thumbnail: Electron.NativeImage; id: string } {
  if (target.thumbnail.isEmpty()) {
    throw captureError('Could not capture that monitor. Check screen recording permissions.')
  }
  return { thumbnail: target.thumbnail, id: target.display_id || String(target.display_id) }
}

async function captureMonitor(displayId: string | null): Promise<CaptureOutcome> {
  const displays = screen.getAllDisplays()
  const display = displayId
    ? displays.find((d) => d.id.toString() === displayId) ?? screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay()
  if (!display) {
    throw captureError('That monitor is no longer available. It may have been disconnected.')
  }
  const { thumbnail, id } = await grabScreenSource(display, displayId)
  return {
    dataUrl: thumbnail.toDataURL(),
    captureType: 'monitor',
    displayId: id
  }
}

/**
 * Resolve which window source should represent "current window". Excludes
 * Buddy's own windows (so capturing while the companion is focused picks the
 * app behind it), prefers the OS-reported foreground window on Windows, then
 * falls back to desktopCapturer's source ordering.
 */
// Invisible overlay / virtual-driver windows reported by desktopCapturer.
// Never user-focusable; produce no useful screenshot. Matched by distinctive
// substrings (case-insensitive) so vendor overlay variants are all caught
// regardless of exact title casing/spelling.
const OVERLAY_WINDOW_PATTERNS = [
  /cue\.agentcursoroverlay\.default/i,
  /nvidia geForce overlay/i
]

function isOverlayWindow(name: string): boolean {
  return OVERLAY_WINDOW_PATTERNS.some((re) => re.test(name))
}

function resolveForegroundSource(
  sources: DesktopSource[],
  buddyTitles: Set<string>
): DesktopSource | undefined {
  const candidates = sources.filter(
    (s) => !buddyTitles.has(s.name) && !isOverlayWindow(s.name)
  )
  return candidates[0] ?? sources[0]
}

async function captureWindow(windowId: string | null): Promise<CaptureOutcome> {
  const thumbSize = defaultThumbSize()
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: thumbSize,
    fetchWindowIcons: true
  })

  const buddyTitles = new Set(BrowserWindow.getAllWindows().map((w) => w.getTitle()).filter(Boolean))

  if (windowId) {
    const matched = sources.find((s) => s.id === windowId)
    if (!matched) {
      throw captureError('That window is no longer available. It may have been closed.')
    }
    if (matched.thumbnail.isEmpty()) {
      throw captureError('That window has no capturable content (it may be minimized).')
    }
    return {
      dataUrl: matched.thumbnail.toDataURL(),
      captureType: 'window',
      windowId,
      windowTitle: matched.name
    }
  }

  // No explicit window: resolve the current/focused one.
  const desktopSources: DesktopSource[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    display_id: s.display_id
  }))

  let resolved: DesktopSource | undefined
  const fgTitle = await getForegroundWindowTitle()
  if (fgTitle) {
    const exact = desktopSources.find(
      (s) => !buddyTitles.has(s.name) && s.name === fgTitle
    )
    if (exact) {
      resolved = exact
    } else {
      const fgLower = fgTitle.toLowerCase()
      const contains = desktopSources.find(
        (s) =>
          !buddyTitles.has(s.name) &&
          (s.name.toLowerCase().includes(fgLower) || fgLower.includes(s.name.toLowerCase()))
      )
      resolved = contains ?? resolveForegroundSource(desktopSources, buddyTitles)
    }
  } else {
    resolved = resolveForegroundSource(desktopSources, buddyTitles)
  }

  const matched = sources.find((s) => s.id === resolved?.id)
  if (!resolved || !matched || matched.thumbnail.isEmpty()) {
    throw captureError('No window is currently available to capture.')
  }
  return {
    dataUrl: matched.thumbnail.toDataURL(),
    captureType: 'window',
    windowId: resolved.id,
    windowTitle: resolved.name
  }
}

async function captureRegion(region: RegionRect): Promise<CaptureOutcome> {
  const displays = screen.getAllDisplays()

  // Find the display best overlapping the region. The rect is in
  // virtual-desktop (DIP) coordinates, so we compare against each display's
  // DIP bounds. Prefer the display fully containing it; otherwise the one
  // with the largest intersecting area.
  const containing = displays.find(
    (d) =>
      region.x >= d.bounds.x &&
      region.x + region.width <= d.bounds.x + d.bounds.width &&
      region.y >= d.bounds.y &&
      region.y + region.height <= d.bounds.y + d.bounds.height
  )

  function intersectionArea(d: Electron.Display): number {
    const x0 = Math.max(region.x, d.bounds.x)
    const y0 = Math.max(region.y, d.bounds.y)
    const x1 = Math.min(region.x + region.width, d.bounds.x + d.bounds.width)
    const y1 = Math.min(region.y + region.height, d.bounds.y + d.bounds.height)
    return Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  }

  const display =
    containing ??
    displays.reduce((best, d) => (intersectionArea(d) > intersectionArea(best) ? d : best), displays[0])

  if (!display) throw captureError('No display available to capture that region.')

  const { thumbnail, id } = await grabScreenSource(display, null)
  const scale = display.scaleFactor || 1

  // Convert the DIP rect into physical pixels relative to the display's top-left.
  const offsetX = Math.round((region.x - display.bounds.x) * scale)
  const offsetY = Math.round((region.y - display.bounds.y) * scale)
  const cropWidth = Math.max(1, Math.min(thumbnail.getSize().width, Math.round(region.width * scale)))
  const cropHeight = Math.max(1, Math.min(thumbnail.getSize().height, Math.round(region.height * scale)))
  const cropped = thumbnail.crop({
    x: offsetX,
    y: offsetY,
    width: cropWidth,
    height: cropHeight
  })

  return {
    dataUrl: cropped.toDataURL(),
    captureType: 'region',
    region,
    displayId: id
  }
}

/** Dedicated intake point for the region-selection overlay's captured rect. */
export async function captureRegionByRect(region: RegionRect): Promise<CaptureOutcome> {
  return captureRegion(region)
}

/** Unified entry point for a capture request of any source type. */
export async function executeCapture(request: CaptureRequest): Promise<CaptureOutcome> {
  switch (request.kind) {
    case 'monitor':
      return captureMonitor(request.displayId)
    case 'window':
      return captureWindow(request.windowId)
    case 'region':
      return captureRegion(request.region)
    default:
      throw captureError('Unknown capture source.')
  }
}

/**
 * Backward-compatible wrapper used by the existing hotkey flow. It captures
 * the configured (or primary) monitor — region/window sources are chosen
 * interactively through the per-message capture picker.
 */
export async function captureScreen(settings: AppSettings): Promise<CaptureOutcome> {
  return executeCapture({ kind: 'monitor', displayId: settings.screen.monitorId })
}
