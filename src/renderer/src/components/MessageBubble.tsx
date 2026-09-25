import { useEffect, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import ReactMarkdown from 'react-markdown'
import { AlertTriangle, Check, Copy, Maximize2, X } from 'lucide-react'

export default function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  const [imageOpen, setImageOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!imageOpen) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setImageOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [imageOpen])

  async function handleCopy(): Promise<void> {
    if (!message.content) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable in some embedded/limited contexts;
      // degrade silently rather than interrupting the flow.
    }
  }

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`msg-col ${isUser ? 'user' : 'assistant'}`}>
        {message.screenshotDataUrl && (
          <button
            className="msg-image-preview"
            type="button"
            title="View screenshot fullscreen"
            aria-label="View screenshot fullscreen"
            onClick={() => setImageOpen(true)}
          >
            <img className="msg-thumb" src={message.screenshotDataUrl} alt="Captured screen" />
            <span className="msg-image-overlay" aria-hidden="true">
              <Maximize2 size={16} />
            </span>
          </button>
        )}
        <div className={`msg-bubble ${message.error ? 'error' : ''}`}>
          {message.error ? (
            <span className="msg-error">
              <AlertTriangle size={14} /> {message.error}
            </span>
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>
        {message.content && (
          <div className="msg-actions">
            <button
              type="button"
              className={`msg-action ${copied ? 'copied' : ''}`}
              title={copied ? 'Copied' : 'Copy message text'}
              aria-label="Copy message text"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>
      {imageOpen && message.screenshotDataUrl && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Captured screen preview">
          <button
            className="image-lightbox-backdrop"
            type="button"
            aria-label="Close screenshot preview"
            onClick={() => setImageOpen(false)}
          />
          <div className="image-lightbox-content">
            <img src={message.screenshotDataUrl} alt="Captured screen enlarged" />
            <button
              className="image-lightbox-close"
              type="button"
              title="Close fullscreen preview"
              aria-label="Close fullscreen preview"
              onClick={() => setImageOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
