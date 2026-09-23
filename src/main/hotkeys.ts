import { globalShortcut } from 'electron'
import type { AppSettings } from '@shared/types'
import { toggleCompanion, getCompanionWindow, createCompanionWindow, showCompanion } from './windows'

let registered: string[] = []

export function registerHotkeys(
  settings: AppSettings,
  onAnalyzeScreen: () => void
): void {
  unregisterHotkeys()

  const openOk = globalShortcut.register(settings.general.hotkeyOpenCompanion, () => {
    toggleCompanion(settings.appearance.companionAlwaysOnTop)
  })
  if (openOk) registered.push(settings.general.hotkeyOpenCompanion)

  const analyzeOk = globalShortcut.register(settings.general.hotkeyAnalyzeScreen, () => {
    const win = getCompanionWindow()
    if (!win || win.isDestroyed()) {
      createCompanionWindow(settings.appearance.companionAlwaysOnTop)
    }
    showCompanion()
    onAnalyzeScreen()
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
