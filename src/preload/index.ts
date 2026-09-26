import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, AskPayload, CompanionState, Conversation, MonitorInfo, ModelInfo, ProviderConfig, ProviderId, RegionRect, WindowInfo } from '@shared/types'

// Everything the renderer is allowed to do lives here, explicitly. No
// Node/Electron internals are exposed beyond these narrow, typed calls —
// per the security rules (context isolation, no arbitrary IPC surface).
const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:save', settings)
  },
  conversations: {
    list: (): Promise<Conversation[]> => ipcRenderer.invoke('conversations:list'),
    get: (id: string): Promise<Conversation | undefined> => ipcRenderer.invoke('conversations:get', id),
    create: (): Promise<Conversation> => ipcRenderer.invoke('conversations:create'),
    rename: (id: string, title: string): Promise<void> => ipcRenderer.invoke('conversations:rename', id, title),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('conversations:delete', id),
    selectSibling: (id: string, messageId: string, direction: -1 | 1): Promise<Conversation | undefined> =>
      ipcRenderer.invoke('conversations:select-sibling', id, messageId, direction),
    branchFrom: (id: string, messageId: string): Promise<Conversation | undefined> =>
      ipcRenderer.invoke('conversations:branch-from', id, messageId),
    selectMessage: (id: string, messageId: string): Promise<Conversation | undefined> =>
      ipcRenderer.invoke('conversations:select-message', id, messageId),
    deleteSubtree: (id: string, messageId: string): Promise<Conversation | undefined> =>
      ipcRenderer.invoke('conversations:delete-subtree', id, messageId),
    search: (query: string): Promise<Conversation[]> => ipcRenderer.invoke('conversations:search', query)
  },
  companion: {
    toggle: (): Promise<void> => ipcRenderer.invoke('companion:toggle'),
    expand: (): Promise<void> => ipcRenderer.invoke('companion:expand'),
    collapse: (): Promise<void> => ipcRenderer.invoke('companion:collapse'),
    hide: (): Promise<void> => ipcRenderer.invoke('companion:hide'),
    getMode: (): Promise<'fab' | 'overlay'> => ipcRenderer.invoke('companion:get-mode'),
    getState: (): Promise<CompanionState> => ipcRenderer.invoke('companion:get-state'),
    getPosition: (): Promise<[number, number]> => ipcRenderer.invoke('companion:get-position'),
    setPosition: (x: number, y: number): Promise<void> => ipcRenderer.invoke('companion:set-position', x, y),
    onModeChange: (cb: (mode: 'fab' | 'overlay') => void) => {
      const listener = (_e: unknown, mode: 'fab' | 'overlay') => cb(mode)
      ipcRenderer.on('buddy:companion-mode', listener)
      return () => {
        ipcRenderer.removeListener('buddy:companion-mode', listener)
      }
    },
    onStateChange: (cb: (state: CompanionState) => void) => {
      const listener = (_e: unknown, state: CompanionState) => cb(state)
      ipcRenderer.on('buddy:companion-state', listener)
      return () => {
        ipcRenderer.removeListener('buddy:companion-state', listener)
      }
    }
  },
  canvas: {
    completeRegion: (rect: RegionRect): void => ipcRenderer.send('region:complete', rect),
    cancelRegion: (): void => ipcRenderer.send('region:cancel')
  },
  ai: {
    fetchModels: (providerId: ProviderId, config: ProviderConfig): Promise<ModelInfo[]> =>
      ipcRenderer.invoke('ai:fetch-models', providerId, config)
  },
  captures: {
    listMonitors: (): Promise<MonitorInfo[]> => ipcRenderer.invoke('captures:list-monitors'),
    listWindows: (): Promise<WindowInfo[]> => ipcRenderer.invoke('captures:list-windows'),
    selectRegion: (): Promise<RegionRect | null> => ipcRenderer.invoke('captures:select-region')
  },
  cancel: (): Promise<void> => ipcRenderer.invoke('buddy:cancel'),
  mainWindow: {
    openConversation: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('window:open-conversation', conversationId),
    consumePendingConversation: (): Promise<string | null> =>
      ipcRenderer.invoke('window:consume-pending-conversation'),
    onOpenConversation: (cb: (conversationId: string) => void) => {
      const listener = (_e: unknown, id: string) => cb(id)
      ipcRenderer.on('buddy:open-conversation', listener)
      return () => {
        ipcRenderer.removeListener('buddy:open-conversation', listener)
      }
    }
  },
  ask: (payload: AskPayload) => ipcRenderer.invoke('buddy:ask', payload),
  onStatus: (cb: (status: string) => void) => {
    const listener = (_e: unknown, status: string) => cb(status)
    ipcRenderer.on('buddy:status', listener)
    return () => {
      ipcRenderer.removeListener('buddy:status', listener)
    }
  },
  onConversationUpdated: (cb: (conversation: Conversation) => void) => {
    const listener = (_e: unknown, conversation: Conversation) => cb(conversation)
    ipcRenderer.on('buddy:conversation-updated', listener)
    return () => {
      ipcRenderer.removeListener('buddy:conversation-updated', listener)
    }
  },
  onTriggerAnalyze: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('buddy:trigger-analyze', listener)
    return () => {
      ipcRenderer.removeListener('buddy:trigger-analyze', listener)
    }
  }
}

contextBridge.exposeInMainWorld('buddy', api)

export type BuddyApi = typeof api
