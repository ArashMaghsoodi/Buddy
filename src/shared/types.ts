// Shared types used by main process, preload bridge, and renderer UI.

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'local'

export interface ProviderConfig {
  id: ProviderId
  label: string
  apiKey?: string
  baseUrl?: string // used for local / OpenAI-compatible endpoints
  model: string
  supportsVision: boolean
}

export interface AppSettings {
  general: {
    launchOnStartup: boolean
    theme: 'dark' | 'light'
    language: string
    notificationsEnabled: boolean
    hotkeyOpenCompanion: string
    hotkeyAnalyzeScreen: string
  }
  screen: {
    captureMode: 'fullScreen' | 'activeWindow' | 'region'
    monitorId: string | null
    visualContextRetention: number // number of past screenshots to keep in memory per conversation
    proactiveModeEnabled: boolean
  }
  ai: {
    activeProvider: ProviderId
    providers: Record<ProviderId, ProviderConfig>
  }
  privacy: {
    cloudProcessingAllowed: boolean
    screenshotRetention: 'session' | 'none' | 'persist'
    conversationRetentionDays: number | null // null = forever
  }
  appearance: {
    overlayOpacity: number // 0..1
    animationIntensity: 'none' | 'subtle' | 'normal'
    density: 'compact' | 'comfortable'
    companionAlwaysOnTop: boolean
  }
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  screenshotId?: string | null // reference to a captured screenshot used for this message
  provider?: ProviderId
  model?: string
  error?: string
}

export interface ScreenshotRef {
  id: string
  createdAt: number
  dataUrl: string // base64 data URL (may be pruned depending on retention setting)
  activeApp?: string
  windowTitle?: string
  ocrText?: string | null
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  provider: ProviderId
  model: string
  messages: ChatMessage[]
}

export interface CaptureResult {
  screenshot: ScreenshotRef
}

export type AppStatus = 'idle' | 'capturing' | 'analyzing' | 'thinking' | 'responding' | 'error'

export interface AskPayload {
  conversationId: string | null
  question: string
  captureScreen: boolean
}

export interface AskStreamChunk {
  conversationId: string
  messageId: string
  delta?: string
  done?: boolean
  error?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchOnStartup: false,
    theme: 'dark',
    language: 'en',
    notificationsEnabled: true,
    hotkeyOpenCompanion: 'Alt+Space',
    hotkeyAnalyzeScreen: 'Alt+Shift+Space'
  },
  screen: {
    captureMode: 'fullScreen',
    monitorId: null,
    visualContextRetention: 3,
    proactiveModeEnabled: false
  },
  ai: {
    activeProvider: 'openai',
    providers: {
      openai: {
        id: 'openai',
        label: 'OpenAI',
        model: 'gpt-4o',
        supportsVision: true
      },
      anthropic: {
        id: 'anthropic',
        label: 'Anthropic',
        model: 'claude-sonnet-4-6',
        supportsVision: true
      },
      google: {
        id: 'google',
        label: 'Google',
        model: 'gemini-1.5-pro',
        supportsVision: true
      },
      local: {
        id: 'local',
        label: 'Local / OpenAI-compatible',
        baseUrl: 'http://localhost:1234/v1',
        model: 'qwen2-vl',
        supportsVision: true
      }
    }
  },
  privacy: {
    cloudProcessingAllowed: true,
    screenshotRetention: 'session',
    conversationRetentionDays: null
  },
  appearance: {
    overlayOpacity: 0.98,
    animationIntensity: 'subtle',
    density: 'comfortable',
    companionAlwaysOnTop: true
  }
}
