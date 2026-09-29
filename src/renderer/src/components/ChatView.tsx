import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import { Loader2, Send, Square } from 'lucide-react'
import MessageBubble from './MessageBubble'
import CapturePicker from './CapturePicker'
import { getActivePath, getSiblings } from '@shared/conversationTree'
import { isRequestBusy, shouldHideEmptyAssistantMessage, shouldShowStatusBubble } from '@shared/messageUi'

const EXAMPLE_PROMPTS = [
  'What am I looking at?',
  'Explain this chart',
  'What happens if I change this parameter?',
  'Where do I change this setting?'
]

function StatusBubble({ status }: { status: string }): JSX.Element {
  const [dotCount, setDotCount] = useState(0)

  useEffect(() => {
    if (status !== 'thinking') {
      setDotCount(0)
      return
    }

    const timer = window.setInterval(() => {
      setDotCount((count) => (count + 1) % 4)
    }, 450)
    return () => window.clearInterval(timer)
  }, [status])

  const dots = status === 'thinking' ? '.'.repeat(dotCount) : '...'

  return (
    <div className="msg-row assistant status-message">
      <div className="msg-col assistant">
        <div className="msg-bubble status-bubble">
          {status === 'thinking' ? `thinking${dots}` : `${status}${dots}`}
        </div>
      </div>
    </div>
  )
}

export default function ChatView(): JSX.Element {
  const activeConversationId = useBuddyStore((s) => s.activeConversationId)
  const conversations = useBuddyStore((s) => s.conversations)
  const ask = useBuddyStore((s) => s.ask)
  const selectSibling = useBuddyStore((s) => s.selectSibling)
  const branchFrom = useBuddyStore((s) => s.branchFrom)
  const editMessage = useBuddyStore((s) => s.editMessage)
  const regenerateMessage = useBuddyStore((s) => s.regenerateMessage)
  const status = useBuddyStore((s) => s.status)
  const [input, setInput] = useState('')
  const [requestActive, setRequestActive] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const activePath = conversation ? getActivePath(conversation) : []
  const busy = isRequestBusy(status, requestActive)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversation?.messages.length, requestActive, status])

  async function handleSend(): Promise<void> {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setRequestActive(true)
    setCancelRequested(false)
    try {
      await ask(q, true)
    } finally {
      setRequestActive(false)
    }
  }

  function handleCancel(): void {
    if (!requestActive || cancelRequested) return
    setCancelRequested(true)
    void buddy().cancel()
  }

  const lastMessage = activePath.at(-1)
  const hasLiveAssistantOutput = lastMessage?.role === 'assistant' && lastMessage.content.length > 0
  const showStatusBubble = shouldShowStatusBubble({
    status,
    requestActive,
    cancelRequested,
    hasLiveAssistantOutput,
    isCompanion: false
  })
  const visibleMessages = activePath.filter((message) =>
    !shouldHideEmptyAssistantMessage(message, status, requestActive, cancelRequested)
  )

  return (
    <>
      <div className="chat-scroll" ref={scrollRef}>
        {!conversation || activePath.length === 0 ? (
          <div className="empty-state">
            <h1>What's on your screen?</h1>
            <p>
              Press your global hotkey anytime, or just ask below — Buddy will look at your current
              screen and answer naturally. Follow-up questions keep the same visual context.
            </p>
            <div className="hint-row">
              {EXAMPLE_PROMPTS.map((p) => (
                <button key={p} className="hint-chip" onClick={() => setInput(p)}>
                  {p}
                </button>
              ))}
            </div>
            {showStatusBubble && <StatusBubble status={status === 'idle' ? 'connecting' : status} />}
          </div>
        ) : (
          <div className="chat-inner">
            {visibleMessages.map((m) => {
              const siblings = getSiblings(conversation, m.id)
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  siblingIndex={siblings.findIndex((sibling) => sibling.id === m.id)}
                  siblingCount={siblings.length}
                  onSelectSibling={(id, direction) => void selectSibling(id, direction)}
                  onBranchFromHere={(id) => void branchFrom(id)}
                  onEdit={(id, content) => void editMessage(id, content)}
                  onRegenerate={(id) => void regenerateMessage(id)}
                />
              )
            })}
            {showStatusBubble && <StatusBubble status={status === 'idle' ? 'connecting' : status} />}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          <textarea
            rows={1}
            placeholder="Ask about your screen…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <CapturePicker />
          <button
            className={`composer-btn primary ${busy ? 'cancel-btn' : ''}`}
            disabled={busy ? cancelRequested : !input.trim()}
            data-tooltip={busy ? 'Cancel response' : 'Send message'}
            data-tooltip-placement="above-end"
            aria-label={busy ? 'Cancel response' : 'Send message'}
            onClick={busy ? handleCancel : handleSend}
          >
            {busy ? (cancelRequested ? <Loader2 size={15} className="spin" /> : <Square size={13} />) : <Send size={15} />}
          </button>
        </div>
      </div>
    </>
  )
}
