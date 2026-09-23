import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'

export class AnthropicProvider implements VisionProvider {
  id = 'anthropic'

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText } = input
    const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com/v1'

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
      res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model,
          system: systemPrompt,
          messages,
          max_tokens: 1024
        })
      })
    } catch (err) {
      throw new ProviderError('Could not reach Anthropic API.', this.id, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ProviderError(`Anthropic request failed (${res.status}): ${body.slice(0, 300)}`, this.id)
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
}
