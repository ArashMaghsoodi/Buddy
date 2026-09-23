import { create } from 'zustand'
import type { AppSettings, AppStatus, Conversation } from '@shared/types'
import { buddy } from '../lib/ipc'

interface BuddyState {
  settings: AppSettings | null
  conversations: Conversation[]
  activeConversationId: string | null
  status: AppStatus
  loading: boolean

  loadInitial: () => Promise<void>
  refreshConversations: () => Promise<void>
  selectConversation: (id: string | null) => Promise<void>
  newConversation: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  ask: (question: string, captureScreen: boolean) => Promise<void>
  setStatus: (status: AppStatus) => void
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
}

export const useBuddyStore = create<BuddyState>((set, get) => ({
  settings: null,
  conversations: [],
  activeConversationId: null,
  status: 'idle',
  loading: true,

  loadInitial: async () => {
    const [settings, conversations] = await Promise.all([
      buddy().settings.get(),
      buddy().conversations.list()
    ])
    set({
      settings,
      conversations,
      activeConversationId: conversations[0]?.id ?? null,
      loading: false
    })

    buddy().onStatus((status) => set({ status: status as AppStatus }))
    buddy().onConversationUpdated(async (id) => {
      const conv = await buddy().conversations.get(id)
      if (!conv) return
      set((state) => {
        const others = state.conversations.filter((c) => c.id !== id)
        return { conversations: [conv, ...others].sort((a, b) => b.updatedAt - a.updatedAt) }
      })
    })
  },

  refreshConversations: async () => {
    const conversations = await buddy().conversations.list()
    set({ conversations })
  },

  selectConversation: async (id) => {
    set({ activeConversationId: id })
  },

  newConversation: async () => {
    const conv = await buddy().conversations.create()
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id
    }))
  },

  saveSettings: async (settings) => {
    const saved = await buddy().settings.save(settings)
    set({ settings: saved })
  },

  ask: async (question, captureScreen) => {
    const { activeConversationId } = get()
    const result = await buddy().ask({
      conversationId: activeConversationId,
      question,
      captureScreen
    })
    if (result?.conversationId) {
      set({ activeConversationId: result.conversationId })
      await get().refreshConversations()
    }
  },

  setStatus: (status) => set({ status }),

  deleteConversation: async (id) => {
    await buddy().conversations.delete(id)
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      const activeConversationId =
        state.activeConversationId === id ? (conversations[0]?.id ?? null) : state.activeConversationId
      return { conversations, activeConversationId }
    })
  },

  renameConversation: async (id, title) => {
    await buddy().conversations.rename(id, title)
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c))
    }))
  }
}))
