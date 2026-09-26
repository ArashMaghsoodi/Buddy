import type { ModelInfo, ProviderConfig } from '@shared/types'
import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'
import { fetchWithRetry, extractErrorMessage } from './httpUtil'

interface CatalogModel {
  reasoning?: boolean
  tool_call?: boolean
  modalities?: { input?: string[] }
}

type ModelCatalog = Record<string, { models?: Record<string, CatalogModel> }>

let modelCatalogPromise: Promise<ModelCatalog | null> | null = null

function loadModelCatalog(): Promise<ModelCatalog | null> {
  if (!modelCatalogPromise) {
    modelCatalogPromise = fetchWithRetry(
      'https://models.dev/api.json',
      { method: 'GET' },
      { timeoutMs: 10_000, retries: 0 }
    )
      .then((response) => (response.ok ? (response.json() as Promise<ModelCatalog>) : null))
      .catch(() => null)
  }
  return modelCatalogPromise
}

function catalogCapabilities(id: string, catalog: ModelCatalog | null): Partial<ModelInfo> {
  if (!catalog) return {}
  const candidates = [id, id.replace(/^[^/]+\//, '')]
  for (const provider of Object.values(catalog)) {
    for (const candidate of candidates) {
      const model = provider.models?.[candidate]
      if (model) {
        return {
          vision: model.modalities?.input?.includes('image') ?? false,
          reasoning: model.reasoning ?? false,
          tools: model.tool_call ?? false
        }
      }
    }
  }
  return {}
}

export interface OpenAICompatibleOptions {
  id: string
  label: string
  defaultBaseUrl: string
  /** Extra static headers some gateways want (e.g. OpenRouter's ranking headers). */
  extraHeaders?: Record<string, string>
  requiresApiKey?: boolean
}

/**
 * A single implementation for every "OpenAI-compatible chat completions"
 * backend. OpenAI, OpenRouter, xAI, DeepSeek, Groq, GitHub Copilot (via a
 * compatible proxy), and any self-hosted/local endpoint all speak the same
 * /chat/completions wire format — only the base URL, auth header value,
 * and a couple of optional extra headers differ, so one class covers all
 * of them instead of duplicating request/response handling per vendor.
 */
export class OpenAICompatibleProvider implements VisionProvider {
  id: string
  private label: string
  private defaultBaseUrl: string
  private extraHeaders: Record<string, string>
  private requiresApiKey: boolean

  constructor(opts: OpenAICompatibleOptions) {
    this.id = opts.id
    this.label = opts.label
    this.defaultBaseUrl = opts.defaultBaseUrl
    this.extraHeaders = opts.extraHeaders ?? {}
    this.requiresApiKey = opts.requiresApiKey ?? true
  }

  private baseUrl(config: ProviderConfig): string {
    const configuredBaseUrl = config.id === 'custom' || config.id === '9router' ? config.baseUrl : undefined
    return (configuredBaseUrl || this.defaultBaseUrl).replace(/\/$/, '')
  }

  private headers(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders
    }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    return headers
  }

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText, signal } = input

    if (this.requiresApiKey && !config.apiKey && !config.baseUrl?.includes('localhost')) {
      throw new ProviderError(`Missing ${this.label} API key. Add one in Settings → AI.`, this.id)
    }
    if (!config.model?.trim()) {
      throw new ProviderError(`No model set for ${this.label}. Pick one in Settings → AI.`, this.id)
    }

    const messages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }]
    for (const m of history) {
      if (m.role === 'system') continue
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: m.content }]
      if (m.role === 'user' && m.screenshotDataUrl) {
        content.push({ type: 'image_url', image_url: { url: m.screenshotDataUrl } })
      }
      messages.push({ role: m.role, content: content.length === 1 ? m.content : content })
    }

    let text = question
    if (ocrText && ocrText.trim().length > 0) {
      text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    }

    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text }]
    if (imageDataUrl) {
      userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
    }
    messages.push({ role: 'user', content: userContent })

    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(config),
          body: JSON.stringify({
            model: config.model,
            messages,
            max_tokens: 1024,
            temperature: 0.4,
            // Explicit non-streaming request: we read one JSON body back.
            // Some gateways default to a streamed response depending on
            // account/model settings, and a stream that gets cut mid-way
            // by a flaky upstream can surface as a confusing connection
            // reset — being explicit here avoids that ambiguity.
            stream: false
          })
        },
        { timeoutMs: 60_000, retries: 2, signal }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not reach ${this.label}: ${msg}`, this.id, err)
    }

    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`${this.label} request failed (${res.status}): ${msg}`, this.id)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new ProviderError(`${this.label} returned an empty response.`, this.id)
    }
    return { text: content }
  }

  async streamChat(input: VisionChatInput, onDelta: (delta: string) => void): Promise<void> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText, signal } = input
    if (this.requiresApiKey && !config.apiKey && !config.baseUrl?.includes('localhost')) {
      throw new ProviderError(`Missing ${this.label} API key. Add one in Settings -> AI.`, this.id)
    }
    if (!config.model?.trim()) {
      throw new ProviderError(`No model set for ${this.label}. Pick one in Settings -> AI.`, this.id)
    }

    const messages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }]
    for (const message of history) {
      if (message.role === 'system') continue
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: message.content }]
      if (message.role === 'user' && message.screenshotDataUrl) {
        content.push({ type: 'image_url', image_url: { url: message.screenshotDataUrl } })
      }
      messages.push({ role: message.role, content: content.length === 1 ? message.content : content })
    }
    let text = question
    if (ocrText?.trim()) text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text }]
    if (imageDataUrl) userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
    messages.push({ role: 'user', content: userContent })

    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(config),
          body: JSON.stringify({ model: config.model, messages, max_tokens: 1024, temperature: 0.4, stream: true })
        },
        { timeoutMs: 60_000, retries: 2, signal }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not reach ${this.label}: ${msg}`, this.id, err)
    }
    if (!res.ok || !res.body) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`${this.label} request failed (${res.status}): ${msg}`, this.id)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const delta = (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
            .choices?.[0]?.delta?.content
          if (delta) onDelta(delta)
        } catch {
          // Ignore incomplete or non-JSON SSE lines.
        }
      }
    }
  }

  async listModels(config: ProviderConfig): Promise<ModelInfo[]> {
    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/models`,
        { method: 'GET', headers: this.headers(config) },
        { timeoutMs: 20_000, retries: 1 }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not fetch models from ${this.label}: ${msg}`, this.id, err)
    }

    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`${this.label} model list failed (${res.status}): ${msg}`, this.id)
    }

    const data = (await res.json()) as {
      data?: Array<{
        id?: string
        architecture?: { modality?: string; input_modalities?: string[] }
        supported_parameters?: string[]
      }>
    }
    const models = (data.data ?? [])
      .map((model): ModelInfo | null => {
        if (!model.id) return null
        const id = model.id.toLowerCase()
        const modalities = [model.architecture?.modality ?? '', ...(model.architecture?.input_modalities ?? [])]
          .join(' ')
          .toLowerCase()
        const parameters = (model.supported_parameters ?? []).map((parameter) => parameter.toLowerCase())
        return {
          id: model.id,
          vision: modalities.includes('image') || modalities.includes('vision'),
          reasoning:
            parameters.some((parameter) => parameter.includes('reason')) ||
            /(^|[/_-])(o1|o3|o4|r1|r2|thinking|reason)([/_.:-]|$)/.test(id),
          tools: parameters.some((parameter) => parameter.includes('tool'))
        }
      })
      .filter((model): model is ModelInfo => model !== null)
      .sort((a, b) => a.id.localeCompare(b.id))

    const catalog = await loadModelCatalog()
    return models.map((model) => ({ ...model, ...catalogCapabilities(model.id, catalog) }))
  }
}
