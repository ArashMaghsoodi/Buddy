import type { ChatMessage, ModelInfo, ProviderConfig } from '@shared/types'

export interface VisionChatInput {
  config: ProviderConfig
  systemPrompt: string
  history: ChatMessage[] // prior text-only messages for conversational context
  question: string
  imageDataUrl?: string | null // the current screenshot, if any, as a data URL
  ocrText?: string | null
  signal?: AbortSignal
}

export interface VisionChatResult {
  text: string
}

/**
 * Every provider implements this one method. Providers are intentionally
 * stateless — all context (history, image, ocr) is passed in explicitly so
 * that swapping providers never changes how context is managed upstream.
 */
export interface VisionProvider {
  id: string
  chat(input: VisionChatInput): Promise<VisionChatResult>
  streamChat?(input: VisionChatInput, onDelta: (delta: string) => void): Promise<void>
  /** Optional: list available model IDs for the "Fetch" button in Settings. */
  listModels?(config: ProviderConfig): Promise<ModelInfo[]>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
