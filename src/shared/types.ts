// Shared types used by main process, preload bridge, and renderer UI.

export type ProviderId =
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'xai'
  | 'deepseek'
  | 'groq'
  | 'github-copilot'
  | '9router'
  | 'custom'

export interface ProviderConfig {
  id: ProviderId
  label: string
  apiKey?: string
  baseUrl?: string // configurable for custom OpenAI-compatible providers
  model: string
  supportsVision: boolean
}

export interface ModelInfo {
  id: string
  vision: boolean
  reasoning: boolean
  tools: boolean
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
  screenshotDataUrl?: string | null // the actual captured image, shown attached above the bubble
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
    activeProvider: 'openrouter',
    providers: {
      openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o',
        supportsVision: true
      },
      openai: {
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        supportsVision: true
      },
      anthropic: {
        id: 'anthropic',
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4-6',
        supportsVision: true
      },
      gemini: {
        id: 'gemini',
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-pro',
        supportsVision: true
      },
      xai: {
        id: 'xai',
        label: 'xAI',
        baseUrl: 'https://api.x.ai/v1',
        model: 'grok-2-vision',
        supportsVision: true
      },
      deepseek: {
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        supportsVision: false
      },
      groq: {
        id: 'groq',
        label: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.2-90b-vision-preview',
        supportsVision: true
      },
      'github-copilot': {
        id: 'github-copilot',
        label: 'GitHub Copilot',
        baseUrl: 'https://api.githubcopilot.com',
        model: 'gpt-4o',
        supportsVision: true
      },
      '9router': {
        id: '9router',
        label: '9Router',
        baseUrl: 'http://localhost:20128/v1',
        model: '',
        supportsVision: true
      },
      custom: {
        id: 'custom',
        label: 'Custom OpenAI-compatible',
        baseUrl: 'http://localhost:1234/v1',
        model: '',
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
