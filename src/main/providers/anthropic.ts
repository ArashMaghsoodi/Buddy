import type { ModelInfo, ProviderConfig } from '@shared/types'
import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'
import { fetchWithRetry, extractErrorMessage } from './httpUtil'

export class AnthropicProvider implements VisionProvider {
  id = 'anthropic'

  private baseUrl(config: ProviderConfig): string {
    return 'https://api.anthropic.com/v1'
  }

  private headers(config: ProviderConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey ?? '',
      'anthropic-version': '2023-06-01'
    }
  }

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText, signal } = input

    if (!config.apiKey) {
      throw new ProviderError('Missing Anthropic API key. Add one in Settings → AI.', this.id)
    }

    const messages: Array<Record<string, unknown>> = []
    for (const m of history) {
      if (m.role === 'system') continue
      messages.push({ role: m.role, content: m.content })
    }

    let text = question
    if (ocrText && ocrText.trim().length > 0) {
      text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    }

    const content: Array<Record<string, unknown>> = []
    if (imageDataUrl) {
      const match = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl)
      if (match) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] }
        })
      }
    }
    content.push({ type: 'text', text })
    messages.push({ role: 'user', content })

    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/messages`,
        {
          method: 'POST',
          headers: this.headers(config),
          body: JSON.stringify({
            model: config.model,
            system: systemPrompt,
            messages,
            max_tokens: 1024,
            stream: false
          })
        },
        { timeoutMs: 60_000, retries: 2, signal }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not reach Anthropic: ${msg}`, this.id, err)
    }

    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`Anthropic request failed (${res.status}): ${msg}`, this.id)
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = data.content?.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      throw new ProviderError('Anthropic returned an empty response.', this.id)
    }
    return { text: textBlock.text }
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
      throw new ProviderError(`Could not fetch models from Anthropic: ${msg}`, this.id, err)
    }
    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`Anthropic model list failed (${res.status}): ${msg}`, this.id)
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id)
      .map((id) => ({ id, vision: true, reasoning: id.toLowerCase().includes('thinking'), tools: true }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}
