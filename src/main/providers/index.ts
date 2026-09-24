import type { ProviderId } from '@shared/types'
import type { VisionProvider } from './types'
import { OpenAICompatibleProvider } from './openaiCompatible'
import { AnthropicProvider } from './anthropic'
import { GoogleProvider } from './google'

// Every provider except Anthropic and Gemini speaks the plain OpenAI
// /chat/completions wire format, so they're all just differently-configured
// instances of the same class.
const registry: Record<ProviderId, VisionProvider> = {
  openrouter: new OpenAICompatibleProvider({
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    // OpenRouter uses these to attribute/route requests; harmless to send,
    // and recommended by their docs to avoid being deprioritized.
    extraHeaders: {
      'HTTP-Referer': 'https://buddy.app',
      'X-Title': 'Buddy'
    }
  }),
  openai: new OpenAICompatibleProvider({
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1'
  }),
  anthropic: new AnthropicProvider(),
  gemini: new GoogleProvider(),
  xai: new OpenAICompatibleProvider({
    id: 'xai',
    label: 'xAI',
    defaultBaseUrl: 'https://api.x.ai/v1'
  }),
  deepseek: new OpenAICompatibleProvider({
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1'
  }),
  groq: new OpenAICompatibleProvider({
    id: 'groq',
    label: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1'
  }),
  // GitHub Copilot's chat API normally requires an OAuth device-flow token
  // rather than a plain API key. Buddy treats it like any other
  // OpenAI-compatible endpoint — point Base URL / API key at a Copilot
  // token or a local compatible proxy.
  'github-copilot': new OpenAICompatibleProvider({
    id: 'github-copilot',
    label: 'GitHub Copilot',
    defaultBaseUrl: 'https://api.githubcopilot.com'
  }),
  custom: new OpenAICompatibleProvider({
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    defaultBaseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false
  })
}

export function getProvider(id: ProviderId): VisionProvider {
  const provider = registry[id]
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

export const SYSTEM_PROMPT = `You are Buddy, a calm and intelligent visual AI companion that sees the user's computer screen and helps them understand whatever is currently visible.

You are general-purpose: you may be shown math, charts, websites, applications, documents, videos, games, designs, or anything else. Do NOT assume the user is a programmer.

Rules:
- Answer based on what is actually visible in the screenshot and any OCR text provided. Don't invent details you can't see.
- Follow-up questions ("why", "this", "it", parameter names) refer to the most recently discussed screen content — use the conversation history to resolve them.
- If visual identification is uncertain (e.g. identifying a person, actor, or object), say so rather than asserting it confidently.
- Be concise, warm, and conversational — like a knowledgeable friend looking at the screen with the user, not a corporate assistant.
- If asked what to click or where something is, describe its location clearly (e.g. "top-right corner", "second row").`
