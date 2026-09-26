import type { AppStatus, ChatMessage } from './types'

export function shouldHideEmptyAssistantMessage(
  message: Pick<ChatMessage, 'role' | 'content' | 'error'>,
  status: AppStatus,
  requestActive: boolean,
  cancelRequested = false
): boolean {
  if (cancelRequested) return false
  if (message.role !== 'assistant') return false
  if (message.content || message.error) return false
  if (requestActive) return true

  return ['capturing', 'analyzing', 'thinking', 'responding'].includes(status)
}

export function shouldShowStatusBubble({
  status,
  requestActive,
  cancelRequested,
  hasLiveAssistantOutput,
  isCompanion
}: {
  status: AppStatus
  requestActive: boolean
  cancelRequested: boolean
  hasLiveAssistantOutput: boolean
  isCompanion: boolean
}): boolean {
  if (isCompanion) return false
  if (cancelRequested || hasLiveAssistantOutput) return false
  return requestActive || (status !== 'idle' && status !== 'error')
}

export function getMessagePreviewText(
  message: Pick<ChatMessage, 'role' | 'content' | 'error'>,
  status: AppStatus,
  requestActive: boolean,
  cancelRequested = false
): string {
  if (message.error) return message.error
  if (message.content) return message.content
  if (message.role === 'assistant') {
    if (cancelRequested) return '(cancelled)'
    if (requestActive || ['capturing', 'analyzing', 'thinking', 'responding'].includes(status)) {
      return 'Thinking…'
    }
    return '(empty message)'
  }
  return '(empty message)'
}
