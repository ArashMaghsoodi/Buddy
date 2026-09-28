import type { AppStatus, ChatMessage } from './types'

export function isAssistantLoadingPlaceholder(content: string | null | undefined): boolean {
  return typeof content === 'string' && /^\.+$/.test(content) && content.length > 0 && content.length <= 3
}

export function shouldHideEmptyAssistantMessage(
  message: Pick<ChatMessage, 'role' | 'content' | 'error'>,
  status: AppStatus,
  requestActive: boolean,
  cancelRequested = false
): boolean {
  if (cancelRequested) return false
  if (message.role !== 'assistant') return false
  if (message.error) return false
  if (message.content) {
    if (isAssistantLoadingPlaceholder(message.content)) return false
    return false
  }
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
