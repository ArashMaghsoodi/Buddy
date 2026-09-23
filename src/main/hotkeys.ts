import { globalShortcut } from 'electron'
import type { AppSettings } from '@shared/types'
import { toggleCompanionMode, expandCompanion, getCompanionWindow } from './windows'

let registered: string[] = []

/**
 * Registers global hotkeys from the current settings. Safe to call again
 * any time settings change (e.g. right after the user records a new
 * hotkey in Settings) — it always unregisters the previous set first.
 */
export function registerHotkeys(settings: AppSettings): void {
  unregisterHotkeys()

  const openOk = globalShortcut.register(settings.general.hotkeyOpenCompanion, () => {
    toggleCompanionMode()
  })
  if (openOk) registered.push(settings.general.hotkeyOpenCompanion)

  const analyzeOk = globalShortcut.register(settings.general.hotkeyAnalyzeScreen, () => {
    expandCompanion()
    getCompanionWindow()?.webContents.send('buddy:trigger-analyze')
  })
  if (analyzeOk) registered.push(settings.general.hotkeyAnalyzeScreen)

  if (!openOk || !analyzeOk) {
    console.warn(
      '[Buddy] One or more global hotkeys failed to register (likely already in use by another app).'
    )
  }
}

export function unregisterHotkeys(): void {
  for (const accel of registered) {
    globalShortcut.unregister(accel)
  }
  registered = []
}
