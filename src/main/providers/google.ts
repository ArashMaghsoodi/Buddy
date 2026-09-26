import type { ModelInfo, ProviderConfig } from '@shared/types'
import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'
import { fetchWithRetry, extractErrorMessage } from './httpUtil'

export class GoogleProvider implements VisionProvider {
  id = 'gemini'

  private baseUrl(config: ProviderConfig): string {
    return 'https://generativelanguage.googleapis.com/v1beta'
  }

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText, signal } = input

    if (!config.apiKey) {
      throw new ProviderError('Missing Google API key. Add one in Settings → AI.', this.id)
    }

    const historyMessages = history.filter((message) => message.role !== 'system').slice(-8)

    let text = question
    if (ocrText && ocrText.trim().length > 0) {
      text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    }

    const historyText = historyMessages
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n')
    const parts: Array<Record<string, unknown>> = [
      { text: `${systemPrompt}\n\n${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}${text}` }
    ]
    for (const message of historyMessages) {
      if (message.role !== 'user' || !message.screenshotDataUrl) continue
      const match = /^data:(image\/\w+);base64,(.*)$/.exec(message.screenshotDataUrl)
      if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } })
    }
    if (imageDataUrl) {
      const match = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl)
      if (match) {
        parts.push({ inline_data: { mime_type: match[1], data: match[2] } })
      }
    }

    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/models/${encodeURIComponent(config.model)}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts }] })
        },
        { timeoutMs: 60_000, retries: 2, signal }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not reach Google Gemini: ${msg}`, this.id, err)
    }

    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`Google request failed (${res.status}): ${msg}`, this.id)
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const textOut = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')
    if (!textOut) {
      throw new ProviderError('Google returned an empty response.', this.id)
    }
    return { text: textOut }
  }

  async listModels(config: ProviderConfig): Promise<ModelInfo[]> {
    let res: Response
    try {
      res = await fetchWithRetry(
        `${this.baseUrl(config)}/models?key=${config.apiKey ?? ''}`,
        { method: 'GET' },
        { timeoutMs: 20_000, retries: 1 }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach the API.'
      throw new ProviderError(`Could not fetch models from Google: ${msg}`, this.id, err)
    }
    if (!res.ok) {
      const msg = await extractErrorMessage(res)
      throw new ProviderError(`Google model list failed (${res.status}): ${msg}`, this.id)
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }
    return (data.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .map((id) => ({ id, vision: true, reasoning: id.toLowerCase().includes('thinking'), tools: true }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}
