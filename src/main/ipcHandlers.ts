import { ipcMain, BrowserWindow, screen } from 'electron'
import { nanoid } from 'nanoid'
import type {
  AppSettings,
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
  appendMessage,
  getPathToMessage,
  getSubtreeMessageIds,
  selectSibling,
  setActiveMessage,
  setBranchDraft
} from '@shared/conversationTree'
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
  getCompanionState,
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

function broadcastSettingsUpdated(settings: AppSettings): void {
  for (const win of [getMainWindow(), getCompanionWindow()]) {
    win?.webContents.send('buddy:settings-updated', settings)
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
    broadcastSettingsUpdated(saved)
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
  ipcMain.handle('conversations:select-sibling', (_e, id: string, messageId: string, direction: -1 | 1) => {
    const conversation = getConversation(id)
    if (!conversation || !selectSibling(conversation, messageId, direction)) return conversation
    conversation.updatedAt = Date.now()
    upsertConversation(conversation)
    broadcastConversationUpdated(conversation)
    return conversation
  })
  ipcMain.handle('conversations:branch-from', (_e, id: string, messageId: string) => {
    const conversation = getConversation(id)
    if (!conversation || !setBranchDraft(conversation, messageId)) return conversation
    conversation.updatedAt = Date.now()
    upsertConversation(conversation)
    broadcastConversationUpdated(conversation)
    return conversation
  })
  ipcMain.handle('conversations:select-message', (_e, id: string, messageId: string) => {
    const conversation = getConversation(id)
    if (!conversation || !conversation.messages.some((message) => message.id === messageId)) return conversation
    setActiveMessage(conversation, messageId)
    conversation.updatedAt = Date.now()
    upsertConversation(conversation)
    broadcastConversationUpdated(conversation)
    return conversation
  })
  ipcMain.handle('conversations:delete-subtree', (_e, id: string, messageId: string) => {
    const conversation = getConversation(id)
    const subtreeRoot = conversation?.messages.find((message) => message.id === messageId)
    if (!conversation || !subtreeRoot) return conversation

    const deletedIds = getSubtreeMessageIds(conversation, messageId)
    conversation.messages = conversation.messages.filter((message) => !deletedIds.has(message.id))
    conversation.selectedChildren = Object.fromEntries(
      Object.entries(conversation.selectedChildren).filter(([parentKey, childId]) =>
        !deletedIds.has(childId) && (parentKey === '$root' || !deletedIds.has(parentKey))
      )
    )
    if (conversation.branchDraftParentId && deletedIds.has(conversation.branchDraftParentId)) {
      conversation.branchDraftParentId = null
    }
    if (conversation.activeMessageId && deletedIds.has(conversation.activeMessageId)) {
      const fallback = subtreeRoot.parentId
        ? conversation.messages.find((message) => message.id === subtreeRoot.parentId)
        : conversation.messages.find((message) => message.parentId === null)
      conversation.activeMessageId = fallback?.id ?? null
      if (fallback) setActiveMessage(conversation, fallback.id)
    }
    conversation.updatedAt = Date.now()
    upsertConversation(conversation)
    broadcastConversationUpdated(conversation)
    return conversation
  })
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
  ipcMain.handle('companion:get-state', () => getCompanionState())
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
      fetchWindowIcons: true
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
      .map((s) => ({
        id: s.id,
        title: s.name,
        iconDataUrl: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
      }))
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
    const settings = getSettings()
    const existing = payload.conversationId ? getConversation(payload.conversationId) : undefined
    const conversation = existing ?? createConversation(
      settings.ai.activeProvider,
      settings.ai.providers[settings.ai.activeProvider].model
    )

    const editTarget = payload.editMessageId
      ? conversation.messages.find((message) => message.id === payload.editMessageId && message.role === 'user')
      : undefined
    const regenerationTarget = payload.regenerateMessageId
      ? conversation.messages.find((message) => message.id === payload.regenerateMessageId && message.role === 'assistant')
      : undefined
    const regenerationUser = regenerationTarget
      ? conversation.messages.find((message) => message.id === regenerationTarget.parentId && message.role === 'user')
      : undefined
    if (payload.editMessageId && !editTarget) throw new Error('The user message to edit could not be found.')
    if (payload.regenerateMessageId && (!regenerationTarget || !regenerationUser)) {
      throw new Error('The assistant response or its user message could not be found.')
    }
    activeRequest = request
    const userParentId = editTarget
      ? editTarget.parentId
      : conversation.branchDraftParentId ?? conversation.activeMessageId
    const contextParentId = regenerationUser ? regenerationUser.parentId : userParentId
    const priorMessages = contextParentId ? getPathToMessage(conversation, contextParentId) : []
    const requestQuestion = regenerationUser?.content ?? payload.question

    const conversationId = conversation.id
    let imageDataUrl: string | null = null
    let ocrText: string | null = null
    let activeApp: string | undefined
    let windowTitle: string | undefined
    let captureNote: string | undefined
    let screenshotId: string | null = null
    let assistantMessage: ChatMessage | null = null
    let cancellationFinalized = false

    function finalizeCancellation(): void {
      if (cancellationFinalized || !assistantMessage) return
      cancellationFinalized = true
      assistantMessage.content = '*canceled by user*'
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
        screenshotId = ref.id
      } else {
        const visualMessage =
          (regenerationUser?.screenshotDataUrl ? regenerationUser : undefined) ??
          (editTarget?.screenshotDataUrl ? editTarget : undefined) ??
          [...priorMessages].reverse().find((message) => message.screenshotDataUrl)
        if (visualMessage?.screenshotDataUrl) {
          imageDataUrl = visualMessage.screenshotDataUrl
          screenshotId = visualMessage.screenshotId ?? null
        }
      }

      if (!regenerationTarget) {
        const userMessage: ChatMessage = {
          id: nanoid(),
          parentId: userParentId,
          role: 'user',
          content: requestQuestion,
          createdAt: Date.now(),
          screenshotId: payload.captureScreen ? screenshotId : editTarget?.screenshotId ?? null,
          screenshotDataUrl: payload.captureScreen ? imageDataUrl : editTarget?.screenshotDataUrl ?? null
        }
        appendMessage(conversation, userMessage, userParentId)
      }
      conversation.updatedAt = Date.now()
      if (conversation.title === 'New conversation') {
        conversation.title = requestQuestion.slice(0, 60)
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

      const createdAssistantMessage: ChatMessage = {
        id: nanoid(),
        parentId: regenerationTarget ? regenerationTarget.parentId : conversation.activeMessageId,
        role: 'assistant',
        content: '.',
        createdAt: Date.now(),
        provider: settings.ai.activeProvider,
        model: providerConfig.model
      }
      assistantMessage = appendMessage(
        conversation,
        createdAssistantMessage,
        regenerationTarget ? regenerationTarget.parentId : conversation.activeMessageId
      )
      upsertConversation(conversation)
      broadcastConversationUpdated(conversation)
      request.onCancel = finalizeCancellation
      if (request.cancelled) finalizeCancellation()

      const input = {
        config: providerConfig,
        systemPrompt: SYSTEM_PROMPT,
        history: priorMessages,
        question: requestQuestion + contextNote,
        imageDataUrl,
        ocrText,
        signal: request.controller.signal
      }

      if (provider.streamChat) {
        await provider.streamChat(input, (delta) => {
          if (request.cancelled || cancellationFinalized) return
          assistantMessage!.content += delta
          conversation.updatedAt = Date.now()
          upsertConversation(conversation)
          broadcastConversationUpdated(conversation)
        })
      } else {
        const result = await provider.chat(input)
        if (request.cancelled) {
          finalizeCancellation()
          return { conversationId, message: assistantMessage }
        }
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

      if (assistantMessage && /^\.+$/.test(assistantMessage.content)) {
        const placeholderIndex = conversation.messages.findIndex((candidate) => candidate.id === assistantMessage!.id)
        if (placeholderIndex >= 0) {
          conversation.messages.splice(placeholderIndex, 1)
          const previousSibling = [...conversation.messages].reverse().find((candidate) => candidate.role !== 'system')
          conversation.activeMessageId = previousSibling?.id ?? null
          conversation.selectedChildren = { ...conversation.selectedChildren }
          delete conversation.selectedChildren[assistantMessage.parentId ?? '$root']
        }
      }

      const errorMessage: ChatMessage = {
        id: nanoid(),
        parentId: assistantMessage?.parentId ?? conversation.activeMessageId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        error: message
      }
      appendMessage(conversation, errorMessage)
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
