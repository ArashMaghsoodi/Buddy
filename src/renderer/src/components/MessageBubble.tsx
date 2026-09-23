import type { ChatMessage } from '@shared/types'

export default function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`msg-bubble ${message.error ? 'error' : ''}`}>
        {message.error ? `⚠ ${message.error}` : message.content}
      </div>
    </div>
  )
}
