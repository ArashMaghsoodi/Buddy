import { ipcMain, BrowserWindow } from 'electron'
import { nanoid } from 'nanoid'
import type { AskPayload, ChatMessage } from '@shared/types'
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
import { captureScreen } from './screenCapture'
import { getProvider, SYSTEM_PROMPT } from './providers'
import { ProviderError } from './providers/types'
import { getMainWindow, getCompanionWindow, setCompanionAlwaysOnTop, toggleCompanion } from './windows'

function broadcastStatus(status: string): void {
  for (const win of [getMainWindow(), getCompanionWindow()]) {
    win?.webContents.send('buddy:status', status)
  }
}

function broadcastConversationUpdated(conversationId: string): void {
  for (const win of [getMainWindow(), getCompanionWindow()]) {
    win?.webContents.send('buddy:conversation-updated', conversationId)
  }
}

export function registerIpcHandlers(): void {
  // ---- Settings ----
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, settings) => {
    const saved = saveSettings(settings)
    setCompanionAlwaysOnTop(saved.appearance.companionAlwaysOnTop)
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
    const settings = getSettings()
    toggleCompanion(settings.appearance.companionAlwaysOnTop)
  })
  ipcMain.handle('companion:hide', () => {
    getCompanionWindow()?.hide()
  })

  // ---- Core ask/analyze flow ----
  ipcMain.handle('buddy:ask', async (event, payload: AskPayload) => {
    const settings = getSettings()
    let conversation = payload.conversationId ? getConversation(payload.conversationId) : undefined

    if (!conversation) {
      conversation = createConversation(settings.ai.activeProvider, settings.ai.providers[settings.ai.activeProvider].model)
    }

    const conversationId = conversation.id
    let imageDataUrl: string | null = null
    let ocrText: string | null = null
    let activeApp: string | undefined
    let windowTitle: string | undefined

    try {
      if (payload.captureScreen) {
        broadcastStatus('capturing')
        const capture = await captureScreen(settings)
        imageDataUrl = capture.dataUrl
        activeApp = capture.activeApp
        windowTitle = capture.windowTitle

        const ref = contextManager.addScreenshot(
          conversationId,
          capture.dataUrl,
          { activeApp, windowTitle, ocrText },
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
        screenshotId: imageDataUrl ? 'latest' : null
      }
      conversation.messages.push(userMessage)
      conversation.updatedAt = Date.now()
      if (conversation.title === 'New conversation') {
        conversation.title = payload.question.slice(0, 60)
      }
      upsertConversation(conversation)
      broadcastConversationUpdated(conversationId)

      broadcastStatus('analyzing')
      const provider = getProvider(settings.ai.activeProvider)
      const providerConfig = settings.ai.providers[settings.ai.activeProvider]

      broadcastStatus('thinking')
      const contextNote =
        activeApp || windowTitle
          ? `\n\n[Context: active application "${activeApp ?? 'unknown'}", window "${windowTitle ?? 'unknown'}"]`
          : ''

      const result = await provider.chat({
        config: providerConfig,
        systemPrompt: SYSTEM_PROMPT,
        history: conversation.messages.slice(0, -1),
        question: payload.question + contextNote,
        imageDataUrl,
        ocrText
      })

      broadcastStatus('responding')
      const assistantMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: result.text,
        createdAt: Date.now(),
        provider: settings.ai.activeProvider,
        model: providerConfig.model
      }
      conversation.messages.push(assistantMessage)
      conversation.updatedAt = Date.now()
      upsertConversation(conversation)
      broadcastConversationUpdated(conversationId)
      broadcastStatus('idle')

      return { conversationId, message: assistantMessage }
    } catch (err) {
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
      broadcastConversationUpdated(conversationId)
      return { conversationId, message: errorMessage, error: message }
    }
  })
}

export function notifyAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}
