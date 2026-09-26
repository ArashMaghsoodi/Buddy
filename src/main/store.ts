import Store from 'electron-store'
import { app } from 'electron'
import { nanoid } from 'nanoid'
import type { AppSettings, Conversation, ProviderId } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { normalizeConversation } from '@shared/conversationTree'

/**
 * Persistence layer. Buddy stores everything locally on disk (in the OS
 * userData directory) — nothing is synced anywhere. We use electron-store
 * (a simple JSON file store) rather than SQLite: for the data shapes here
 * (a settings object + an array of conversations) a document store is
 * simpler and avoids native-module build issues, with no real downside at
 * this scale. This can be swapped for SQLite later without touching the
 * rest of the app, since callers only see the methods below.
 */

interface SettingsSchema {
  settings: AppSettings
}

interface ConversationsSchema {
  conversations: Conversation[]
}

const settingsStore = new Store<SettingsSchema>({
  name: 'buddy-settings',
  defaults: { settings: DEFAULT_SETTINGS }
})

const conversationsStore = new Store<ConversationsSchema>({
  name: 'buddy-conversations',
  defaults: { conversations: [] }
})

export function getSettings(): AppSettings {
  // Merge with defaults so new settings fields added in later versions
  // always have a sane value even for existing users.
  const stored = settingsStore.get('settings')
  const providers = {} as AppSettings['ai']['providers']
  for (const providerId of Object.keys(DEFAULT_SETTINGS.ai.providers) as ProviderId[]) {
    const provider = stored?.ai?.providers?.[providerId]
    providers[providerId] = {
      ...DEFAULT_SETTINGS.ai.providers[providerId],
      ...provider,
      label: DEFAULT_SETTINGS.ai.providers[providerId].label,
      ...(providerId === 'custom' || providerId === '9router'
        ? {}
        : { baseUrl: DEFAULT_SETTINGS.ai.providers[providerId].baseUrl })
    }
  }

  // Remove the legacy duplicate custom provider from persisted settings.
  if (stored?.ai?.providers && 'custom-openai-compatible' in stored.ai.providers) {
    const cleanedProviders = { ...stored.ai.providers }
    delete (cleanedProviders as Record<string, unknown>)['custom-openai-compatible']
    settingsStore.set('settings', { ...stored, ai: { ...stored.ai, providers: cleanedProviders } })
  }

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    general: { ...DEFAULT_SETTINGS.general, ...stored?.general },
    screen: { ...DEFAULT_SETTINGS.screen, ...stored?.screen },
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...stored?.ai,
      providers
    },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...stored?.privacy },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...stored?.appearance }
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  settingsStore.set('settings', settings);
  applyLaunchOnStartup(settings.general.launchOnStartup)
  applyRetentionCleanup(settings)
  return settings
}

function applyLaunchOnStartup(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch {
    // Non-fatal on platforms/configs where this isn't supported.
  }
}

function applyRetentionCleanup(settings: AppSettings): void {
  if (settings.privacy.conversationRetentionDays == null) return
  const cutoff = Date.now() - settings.privacy.conversationRetentionDays * 24 * 60 * 60 * 1000
  const all = conversationsStore.get('conversations')
  const kept = all.filter((c) => c.updatedAt >= cutoff)
  if (kept.length !== all.length) {
    conversationsStore.set('conversations', kept)
  }
}

export function listConversations(): Conversation[] {
  const conversations = migrateStoredConversations()
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getConversation(id: string): Conversation | undefined {
  return migrateStoredConversations().find((c) => c.id === id)
}

function migrateStoredConversations(): Conversation[] {
  const stored = conversationsStore.get('conversations')
  const migrated = stored.map(normalizeConversation)
  if (migrated.some((conversation, index) => conversation !== stored[index])) {
    conversationsStore.set('conversations', migrated)
  }
  return migrated
}

export function createConversation(provider: Conversation['provider'], model: string): Conversation {
  const conv: Conversation = {
    id: nanoid(),
    title: 'New conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    provider,
    model,
    messages: [],
    selectedChildren: {},
    activeMessageId: null,
    branchDraftParentId: null
  }
  const all = conversationsStore.get('conversations')
  conversationsStore.set('conversations', [conv, ...all])
  return conv
}

export function upsertConversation(conv: Conversation): void {
  const all = conversationsStore.get('conversations')
  const idx = all.findIndex((c) => c.id === conv.id)
  const toStore = sanitizeForStorage(normalizeConversation(conv))
  if (idx === -1) {
    conversationsStore.set('conversations', [toStore, ...all])
  } else {
    all[idx] = toStore
    conversationsStore.set('conversations', all)
  }
}

/**
 * Screenshots are shown live in the current session regardless of the
 * privacy setting (that's just UI feedback for the turn that was just
 * sent), but whether they're written to disk is governed by
 * `privacy.screenshotRetention`. "persist" keeps them in the conversation
 * file; "session" and "none" both strip them before writing — the
 * difference between those two is handled elsewhere (session simply never
 * gets to this point again after the app restarts, since nothing was
 * written).
 */
function sanitizeForStorage(conv: Conversation): Conversation {
  const settings = getSettings()
  if (settings.privacy.screenshotRetention === 'persist') return conv
  const hasAny = conv.messages.some((m) => m.screenshotDataUrl)
  if (!hasAny) return conv
  return {
    ...conv,
    messages: conv.messages.map((m) =>
      m.screenshotDataUrl ? { ...m, screenshotDataUrl: null } : m
    )
  }
}

export function renameConversation(id: string, title: string): void {
  const all = conversationsStore.get('conversations')
  const idx = all.findIndex((c) => c.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], title, updatedAt: Date.now() }
  conversationsStore.set('conversations', all)
}

export function deleteConversation(id: string): void {
  const all = conversationsStore.get('conversations')
  conversationsStore.set(
    'conversations',
    all.filter((c) => c.id !== id)
  )
}

export function searchConversations(query: string): Conversation[] {
  const q = query.trim().toLowerCase()
  if (!q) return listConversations()
  return listConversations().filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
  )
}
