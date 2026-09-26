import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'

/**
 * OpenAI-compatible chat completions provider. Also used for local /
 * self-hosted OpenAI-compatible endpoints (LM Studio, Ollama's OpenAI
 * shim, vLLM, etc.) — only baseUrl/apiKey differ.
 */
export class OpenAIProvider implements VisionProvider {
  id = 'openai'

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText } = input
    const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com/v1'

    if (!config.baseUrl && !config.apiKey) {
      throw new ProviderError('Missing OpenAI API key. Add one in Settings → AI.', this.id)
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

    const userContent: Array<Record<string, unknown>> = []
    let text = question
    if (ocrText && ocrText.trim().length > 0) {
      text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    }
    userContent.push({ type: 'text', text })
    if (imageDataUrl) {
      userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
    }
    messages.push({ role: 'user', content: userContent })

    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: 1024,
          temperature: 0.4
        })
      })
    } catch (err) {
      throw new ProviderError('Could not reach OpenAI-compatible endpoint.', this.id, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ProviderError(`OpenAI request failed (${res.status}): ${body.slice(0, 300)}`, this.id)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new ProviderError('OpenAI returned an empty response.', this.id)
    }
    return { text: content }
  }
}
