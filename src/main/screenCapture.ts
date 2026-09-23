import { desktopCapturer, screen } from 'electron'
import type { AppSettings } from '@shared/types'

export interface CaptureOutcome {
  dataUrl: string
  windowTitle?: string
  activeApp?: string
}

/**
 * Captures the screen according to the current capture-mode setting.
 *
 * MVP scope: "fullScreen" and "activeWindow" are fully supported via
 * desktopCapturer. "region" reuses the full-screen capture of the primary
 * display for now and is marked for the region-selection overlay in a
 * later phase (see Phase 7 in the product context) — the renderer can crop
 * further once a selection UI exists.
 */
export async function captureScreen(settings: AppSettings): Promise<CaptureOutcome> {
  const primaryDisplay = screen.getPrimaryDisplay()
  const scaleFactor = primaryDisplay.scaleFactor || 1

  const thumbnailSize = {
    width: Math.round(primaryDisplay.size.width * scaleFactor),
    height: Math.round(primaryDisplay.size.height * scaleFactor)
  }

  if (settings.screen.captureMode === 'activeWindow') {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize
    })
    // desktopCapturer doesn't tell us which window is currently focused
    // directly; the first source Windows reports is typically the
    // foreground window in most sessions. We fall back to full screen if
    // no window sources are available (e.g. all minimized).
    const top = sources[0]
    if (top && !top.thumbnail.isEmpty()) {
      return {
        dataUrl: top.thumbnail.toDataURL(),
        windowTitle: top.name
      }
    }
    // fall through to full-screen capture below
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  })

  let target = sources[0]
  if (settings.screen.monitorId) {
    const match = sources.find((s) => s.display_id === settings.screen.monitorId)
    if (match) target = match
  }

  if (!target || target.thumbnail.isEmpty()) {
    throw new Error('No screen source available to capture. Check screen recording permissions.')
  }

  return {
    dataUrl: target.thumbnail.toDataURL()
  }
}
