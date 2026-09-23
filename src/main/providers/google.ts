import type { VisionChatInput, VisionChatResult, VisionProvider } from './types'
import { ProviderError } from './types'

export class GoogleProvider implements VisionProvider {
  id = 'google'

  async chat(input: VisionChatInput): Promise<VisionChatResult> {
    const { config, systemPrompt, history, question, imageDataUrl, ocrText } = input

    if (!config.apiKey) {
      throw new ProviderError('Missing Google API key. Add one in Settings → AI.', this.id)
    }

    const baseUrl =
      config.baseUrl?.replace(/\/$/, '') || 'https://generativelanguage.googleapis.com/v1beta'

    const historyText = history
      .filter((m) => m.role !== 'system')
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')

    let text = question
    if (ocrText && ocrText.trim().length > 0) {
      text += `\n\n[OCR-extracted text from the screen, may be partial or noisy]\n${ocrText.slice(0, 4000)}`
    }

    const parts: Array<Record<string, unknown>> = [
      { text: `${systemPrompt}\n\n${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}${text}` }
    ]
    if (imageDataUrl) {
      const match = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl)
      if (match) {
        parts.push({ inline_data: { mime_type: match[1], data: match[2] } })
      }
    }

    let res: Response
    try {
      res = await fetch(
        `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts }] })
        }
      )
    } catch (err) {
      throw new ProviderError('Could not reach Google Gemini API.', this.id, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ProviderError(`Google request failed (${res.status}): ${body.slice(0, 300)}`, this.id)
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
}
