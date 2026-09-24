import type { ChatMessage } from '@shared/types'
import ReactMarkdown from 'react-markdown'

export default function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`msg-col ${isUser ? 'user' : 'assistant'}`}>
        {message.screenshotDataUrl && (
          <img className="msg-thumb" src={message.screenshotDataUrl} alt="Captured screen" />
        )}
        <div className={`msg-bubble ${message.error ? 'error' : ''}`}>
          {message.error ? (
            `⚠ ${message.error}`
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}
