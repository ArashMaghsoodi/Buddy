import { ipcMain, BrowserWindow, screen } from 'electron'
import { nanoid } from 'nanoid'
import type {
  AskPayload,
  ChatMessage,
  Conversation,
  MonitorInfo,
  ProviderConfig,
  ProviderId,
  RegionRect,
  WindowInfo
} from '@shared/types'
import {
  getSettings,
  saveSettings,
  listConversations,
  getConversation,
  createConversation,
  upsertConversation,
  renameConversation,
  deleteConversation,
  searchConversations
} from './store'
import { contextManager } from './contextManager'
import { captureScreen, executeCapture } from './screenCapture'
import { selectRegion, completeRegionSelection, dismissOverlay } from './regionOverlay'
import { getProvider, SYSTEM_PROMPT } from './providers'
import { ProviderError } from './providers/types'
import {
  getMainWindow,
  getCompanionWindow,
  setCompanionAlwaysOnTop,
  toggleCompanionMode,
  expandCompanion,
  collapseCompanion,
  hideCompanionWindow,
  getCompanionMode,
  openConversationInMainWindow,
  consumePendingConversationId
} from './windows'
import { registerHotkeys } from './hotkeys'

function broadcastStatus(status: string): void {
  for (const win of [getMainWindow(), getCompanionWindow()]) {
    win?.webContents.send('buddy:status', status)
  }
}

function broadcastConversationUpdated(conversation: Conversation): void {
  // Send the full in-memory conversation, not just an id the renderer would
  // then re-fetch: the on-disk copy may have screenshot data stripped per
  // the retention setting, but the current session should still show what
  // was just captured.
  for (const win of [getMainWindow(), getCompanionWindow()]) {
    win?.webContents.send('buddy:conversation-updated', conversation)
  }
}

let activeRequest: { controller: AbortController; cancelled: boolean; onCancel?: () => void } | null = null

export function registerIpcHandlers(): void {
  // ---- Settings ----
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, settings) => {
    const saved = saveSettings(settings)
    setCompanionAlwaysOnTop(saved.appearance.companionAlwaysOnTop)
    registerHotkeys(saved)
    return saved
  })

  // ---- Conversations ----
  ipcMain.handle('conversations:list', () => listConversations())
  ipcMain.handle('conversations:get', (_e, id: string) => getConversation(id))
  ipcMain.handle('conversations:rename', (_e, id: string, title: string) => renameConversation(id, title))
  ipcMain.handle('conversations:delete', (_e, id: string) => {
    deleteConversation(id)
    contextManager.clear(id)
  })
  ipcMain.handle('conversations:search', (_e, query: string) => searchConversations(query))
  ipcMain.handle('conversations:create', () => {
    const settings = getSettings()
    const providerConfig = settings.ai.providers[settings.ai.activeProvider]
    return createConversation(settings.ai.activeProvider, providerConfig.model)
  })

  // ---- Companion window control ----
  ipcMain.handle('companion:toggle', () => {
    toggleCompanionMode()
  })
  ipcMain.handle('companion:expand', () => {
    expandCompanion()
  })
  ipcMain.handle('companion:collapse', () => {
    collapseCompanion()
  })
  ipcMain.handle('companion:hide', () => {
    hideCompanionWindow()
  })
  ipcMain.handle('companion:get-mode', () => getCompanionMode())
  ipcMain.handle('companion:get-position', () => getCompanionWindow()?.getPosition() ?? [0, 0])
  ipcMain.handle('companion:set-position', (_e, x: number, y: number) => {
    getCompanionWindow()?.setPosition(Math.round(x), Math.round(y))
  })
  ipcMain.handle('buddy:cancel', () => {
    if (activeRequest) {
      activeRequest.cancelled = true
      activeRequest.controller.abort()
      activeRequest.onCancel?.()
    }
  })

  // ---- Provider model listing ----
  ipcMain.handle('ai:fetch-models', async (_e, providerId: ProviderId, config: ProviderConfig) => {
    const provider = getProvider(providerId)
    if (!provider.listModels) {
      throw new Error(`${config.label || providerId} doesn't support listing models — type one in manually.`)
    }
    return provider.listModels(config)
  })

  // ---- Capture enumeration & region selection ----
  ipcMain.handle('captures:list-monitors', (): MonitorInfo[] => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      label: `Monitor ${i + 1}${d.id === primary.id ? ' (primary)' : ''}`,
      isPrimary: d.id === primary.id,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      workArea: d.workArea
    }))
  })

  ipcMain.handle('captures:list-windows', async (): Promise<WindowInfo[]> => {
    const isOverlayWindow = (name: string): boolean =>
      /cue\.agentcursoroverlay\.default/i.test(name) || /nvidia geForce overlay/i.test(name)
    const { desktopCapturer } = await import('electron')
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    })
    const buddyTitles = new Set(
      BrowserWindow.getAllWindows()
        .map((w) => w.getTitle())
        .filter(Boolean)
    )

    // Invisible overlay / virtual-driver windows that desktopCapturer
    // reports but that are never user-focusable and produce no useful
    // screenshot. Filtered by distinctive substrings (case-insensitive)
    // so vendor overlay variants are all caught.
    return sources
      .filter((s) => !buddyTitles.has(s.name) && !isOverlayWindow(s.name))
      .map((s) => ({ id: s.id, title: s.name }))
  })

  ipcMain.handle('captures:select-region', async (): Promise<RegionRect | null> => {
    return selectRegion()
  })
  ipcMain.on('region:complete', (event, rect: RegionRect) => {
    completeRegionSelection(event, rect)
  })
  ipcMain.on('region:cancel', () => {
    dismissOverlay()
  })

  // ---- Overlay → maximized window handoff ----
  ipcMain.handle('window:open-conversation', (_e, conversationId: string) => {
    openConversationInMainWindow(conversationId)
  })
  ipcMain.handle('window:consume-pending-conversation', () => consumePendingConversationId())

  // ---- Core ask/analyze flow ----
  ipcMain.handle('buddy:ask', async (event, payload: AskPayload) => {
    const request: { controller: AbortController; cancelled: boolean; onCancel?: () => void } = {
      controller: new AbortController(),
      cancelled: false
    }
    activeRequest = request
    const settings = getSettings()
    const existing = payload.conversationId ? getConversation(payload.conversationId) : undefined
    const conversation = existing ?? createConversation(
      settings.ai.activeProvider,
      settings.ai.providers[settings.ai.activeProvider].model
    )

    const conversationId = conversation.id
    let imageDataUrl: string | null = null
    let ocrText: string | null = null
    let activeApp: string | undefined
    let windowTitle: string | undefined
    let captureNote: string | undefined
    let assistantMessage: ChatMessage | null = null
    let cancellationFinalized = false

    function finalizeCancellation(): void {
      if (cancellationFinalized || !assistantMessage) return
      cancellationFinalized = true
      assistantMessage.content += `${assistantMessage.content ? '\n\n' : ''}*canceled by user*`
      conversation.updatedAt = Date.now()
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)
      broadcastStatus('idle')
    }

    try {
      if (payload.captureScreen) {
        broadcastStatus('capturing')
        const capture = payload.capture
          ? await executeCapture(payload.capture)
          : await captureScreen(settings)
        imageDataUrl = capture.dataUrl
        activeApp = capture.activeApp
        windowTitle = capture.windowTitle
        const captureType = capture.captureType
        const region = capture.region
        const displayId = capture.displayId
        const windowId = capture.windowId

        captureNote =
          captureType === 'window'
            ? `Current window: ${windowTitle ?? 'unknown'}`
            : captureType === 'region'
              ? `Screen region${windowTitle ? ` of "${windowTitle}"` : ''}`
              : 'Full monitor'
        const ref = contextManager.addScreenshot(
          conversationId,
          capture.dataUrl,
          { activeApp, windowTitle, ocrText, captureType, displayId, windowId, region },
          settings.screen.visualContextRetention
        )
        void ref
      } else {
        // No new capture — reuse the most recent screenshot in this
        // conversation so follow-ups ("why?", "what about k?") still have
        // visual grounding.
        const latest = contextManager.latest(conversationId)
        if (latest) {
          imageDataUrl = latest.dataUrl
          ocrText = latest.ocrText ?? null
          activeApp = latest.activeApp
          windowTitle = latest.windowTitle
        }
      }

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: 'user',
        content: payload.question,
        createdAt: Date.now(),
        screenshotId: imageDataUrl ? 'latest' : null,
        screenshotDataUrl: payload.captureScreen ? imageDataUrl : null
      }
      conversation.messages.push(userMessage)
      conversation.updatedAt = Date.now()
      if (conversation.title === 'New conversation') {
        conversation.title = payload.question.slice(0, 60)
      }
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)

      broadcastStatus('analyzing')
      const provider = getProvider(settings.ai.activeProvider)
      const providerConfig = settings.ai.providers[settings.ai.activeProvider]

      broadcastStatus('thinking')
      const contextNote =
        captureNote || activeApp || windowTitle
          ? `\n\n[Context: ${captureNote ?? 'captured screenshot'}${
              activeApp || windowTitle
                ? `, active application "${activeApp ?? 'unknown'}", window "${windowTitle ?? 'unknown'}"`
                : ''
            }]`
          : ''

      assistantMessage = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        provider: settings.ai.activeProvider,
        model: providerConfig.model
      }
      conversation.messages.push(assistantMessage)
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)
      request.onCancel = finalizeCancellation
      if (request.cancelled) finalizeCancellation()

      const input = {
        config: providerConfig,
        systemPrompt: SYSTEM_PROMPT,
        history: conversation.messages.slice(0, -1),
        question: payload.question + contextNote,
        imageDataUrl,
        ocrText,
        signal: request.controller.signal
      }

      if (provider.streamChat) {
        await provider.streamChat(input, (delta) => {
          assistantMessage!.content += delta
          conversation.updatedAt = Date.now()
          upsertConversation(conversation)
          broadcastConversationUpdated(conversation)
        })
      } else {
        const result = await provider.chat(input)
        assistantMessage.content = result.text
        conversation.updatedAt = Date.now()
        upsertConversation(conversation)
        broadcastConversationUpdated(conversation)
      }

      if (request.cancelled) {
        finalizeCancellation()
        return { conversationId, message: assistantMessage }
      }

      broadcastStatus('responding')
      conversation.updatedAt = Date.now()
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)
      broadcastStatus('idle')

      return { conversationId, message: assistantMessage }
    } catch (err) {
      if (request.cancelled && assistantMessage) {
        finalizeCancellation()
        return { conversationId, message: assistantMessage }
      }
      broadcastStatus('error')
      const message =
        err instanceof ProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong while analyzing your screen.'

      const errorMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        error: message
      }
      conversation.messages.push(errorMessage)
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)
      return { conversationId, message: errorMessage, error: message }
    } finally {
      if (activeRequest === request) activeRequest = null
    }
  })
}

export function notifyAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}
