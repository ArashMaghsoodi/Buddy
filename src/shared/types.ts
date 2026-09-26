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

export interface CaptureTargetRef {
  id: string
  title: string
}

export interface AppSettings {
  general: {
    launchOnStartup: boolean
    startMinimized: boolean
    theme: 'dark' | 'light'
    language: string
    hotkeyOpenCompanion: string
    hotkeyAnalyzeScreen: string
  }
  screen: {
    monitorId: string | null
    visualContextRetention: number // number of past screenshots to keep in memory per conversation
    proactiveModeEnabled: boolean
    captureTargetPins: CaptureTargetRef[]
    captureTargetBlacklist: CaptureTargetRef[]
  }
  ai: {
    activeProvider: ProviderId
    providers: Record<ProviderId, ProviderConfig>
  }
  privacy: {
    cloudProcessingAllowed: boolean
    anonymousDiagnosticsEnabled: boolean
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
  parentId: string | null
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
  captureType?: 'monitor' | 'window' | 'region'
  displayId?: string
  windowId?: string
  activeApp?: string
  windowTitle?: string
  region?: RegionRect
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
  selectedChildren: Record<string, string>
  activeMessageId: string | null
  branchDraftParentId: string | null
}

export interface MonitorInfo {
  id: string // display_id
  label: string // "Monitor 1", "Monitor 2", ...
  isPrimary: boolean
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  workArea: { x: number; y: number; width: number; height: number }
}

export interface WindowInfo {
  id: string // desktopCapturer source id
  title: string
  iconDataUrl: string | null // window icon as data URL (null = none available)
}

export interface RegionRect {
  x: number
  y: number
  width: number
  height: number
}

/** Which monitor/desktop area contains the region (virtual-desktop CSS px coords). */
export interface CaptureRegion {
  rect: RegionRect
}

/** A unified capture request — one of three source types. */
export type CaptureRequest =
  | { kind: 'monitor'; displayId: string | null } // null = primary monitor
  | { kind: 'window'; windowId: string | null }    // null = current/focused window
  | { kind: 'region'; region: RegionRect }          // region selected by the user

export interface CompanionState {
  mode: 'fab' | 'overlay'
  visible: boolean
}

export interface CaptureOutcome {
  dataUrl: string
  captureType: 'monitor' | 'window' | 'region'
  displayId?: string
  windowId?: string
  windowTitle?: string
  activeApp?: string
  region?: RegionRect
}

export type CaptureResult = {
  screenshot: ScreenshotRef
}

export type AppStatus = 'idle' | 'capturing' | 'analyzing' | 'thinking' | 'responding' | 'error'

export interface AskPayload {
  conversationId: string | null
  question: string
  captureScreen: boolean
  capture?: CaptureRequest // overrides the default capture source when provided
  editMessageId?: string
  regenerateMessageId?: string
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
    startMinimized: false,
    theme: 'dark',
    language: 'en',
    hotkeyOpenCompanion: 'Alt+Space',
    hotkeyAnalyzeScreen: 'Alt+Shift+Space'
  },
  screen: {
    monitorId: null,
    visualContextRetention: 3,
    proactiveModeEnabled: false,
    captureTargetPins: [],
    captureTargetBlacklist: []
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
    anonymousDiagnosticsEnabled: false,
    conversationRetentionDays: null
  },
  appearance: {
    overlayOpacity: 0.98,
    animationIntensity: 'subtle',
    density: 'comfortable',
    companionAlwaysOnTop: true
  }
}
