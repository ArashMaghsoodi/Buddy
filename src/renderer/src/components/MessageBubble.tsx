import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import ReactMarkdown from 'react-markdown'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Maximize2,
  Pencil,
  RefreshCw,
  X
} from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
  siblingIndex?: number
  siblingCount?: number
  onSelectSibling?: (messageId: string, direction: -1 | 1) => void
  onEdit?: (messageId: string, content: string) => void
  onRegenerate?: (messageId: string) => void
  onBranchFromHere?: (messageId: string) => void
}

export default function MessageBubble({
  message,
  siblingIndex = 0,
  siblingCount = 1,
  onSelectSibling,
  onEdit,
  onRegenerate,
  onBranchFromHere
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user'
  const bubbleRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [imageOpen, setImageOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [actionsAlign, setActionsAlign] = useState<'left' | 'right'>('left')
  const [bubbleWidth, setBubbleWidth] = useState<number | null>(null)

  useEffect(() => {
    if (!imageOpen) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setImageOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [imageOpen])

  useEffect(() => {
    const bubbleEl = bubbleRef.current
    const actionsEl = actionsRef.current
    if (!bubbleEl || !actionsEl) return

    const updateAlignment = () => {
      const nextBubbleWidth = bubbleEl.getBoundingClientRect().width
      const actionsWidth = actionsEl.scrollWidth
      setBubbleWidth(nextBubbleWidth)
      setActionsAlign(nextBubbleWidth < actionsWidth + 8 ? 'right' : 'left')
    }

    updateAlignment()
    const observer = new ResizeObserver(updateAlignment)
    observer.observe(bubbleEl)
    observer.observe(actionsEl)
    return () => observer.disconnect()
  }, [message.content, message.error, siblingCount, editing, onEdit, onRegenerate, onBranchFromHere])

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

  const actionStyle = actionsAlign === 'right' && bubbleWidth !== null ? { width: `${bubbleWidth}px` } : undefined

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
        <div
          ref={bubbleRef}
          className={`msg-bubble ${message.error ? 'error' : ''} ${editing ? 'editing' : ''}`}
        >
          {editing ? (
            <textarea
              className="msg-edit-input"
              aria-label="Edit message"
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              autoFocus
            />
          ) : message.error ? (
            <span className="msg-error">
              <AlertTriangle size={14} /> {message.error}
            </span>
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>
        {editing && (
          <div
            ref={actionsRef}
            className={`msg-actions msg-edit-actions ${actionsAlign === 'right' ? 'align-right' : 'align-left'}`}
            style={actionStyle}
          >
            <button type="button" className="msg-action" title="Cancel edit" onClick={() => setEditing(false)}>
              <X size={14} />
            </button>
            <button
              type="button"
              className="msg-action"
              title="Submit edited message as a new branch"
              disabled={!editContent.trim() || editContent === message.content}
              onClick={() => {
                onEdit?.(message.id, editContent.trim())
                setEditing(false)
              }}
            >
              <Check size={14} />
            </button>
          </div>
        )}
        {!editing && (message.content || siblingCount > 1 || onEdit || onRegenerate || onBranchFromHere) && (
          <div
            ref={actionsRef}
            className={`msg-actions ${actionsAlign === 'right' ? 'align-right' : 'align-left'}`}
            style={actionStyle}
          >
            {siblingCount > 1 && (
              <div className="msg-sibling-switcher" aria-label="Alternative messages">
                <button
                  type="button"
                  className="msg-action"
                  title="Previous alternative"
                  aria-label="Previous alternative"
                  disabled={siblingIndex === 0}
                  onClick={() => onSelectSibling?.(message.id, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{siblingIndex + 1}/{siblingCount}</span>
                <button
                  type="button"
                  className="msg-action"
                  title="Next alternative"
                  aria-label="Next alternative"
                  disabled={siblingIndex === siblingCount - 1}
                  onClick={() => onSelectSibling?.(message.id, 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              type="button"
              className={`msg-action ${copied ? 'copied' : ''}`}
              title={copied ? 'Copied' : 'Copy message text'}
              aria-label="Copy message text"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {isUser && onEdit && (
              <button
                type="button"
                className="msg-action"
                title="Edit message"
                aria-label="Edit message"
                onClick={() => {
                  setEditContent(message.content)
                  setEditing(true)
                }}
              >
                <Pencil size={14} />
              </button>
            )}
            {!isUser && message.role === 'assistant' && onRegenerate && (
              <button
                type="button"
                className="msg-action"
                title="Regenerate response as a new branch"
                aria-label="Regenerate response"
                onClick={() => onRegenerate(message.id)}
              >
                <RefreshCw size={14} />
              </button>
            )}
            {message.role !== 'system' && onBranchFromHere && (
              <button
                type="button"
                className="msg-action"
                title="Branch from here"
                aria-label="Branch from here"
                onClick={() => onBranchFromHere(message.id)}
              >
                <GitBranch size={14} />
              </button>
            )}
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
