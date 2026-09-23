import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import MessageBubble from './MessageBubble'

const EXAMPLE_PROMPTS = [
  'What am I looking at?',
  'Explain this chart',
  'What happens if I change this parameter?',
  'Where do I change this setting?'
]

export default function ChatView(): JSX.Element {
  const activeConversationId = useBuddyStore((s) => s.activeConversationId)
  const conversations = useBuddyStore((s) => s.conversations)
  const ask = useBuddyStore((s) => s.ask)
  const status = useBuddyStore((s) => s.status)
  const [input, setInput] = useState('')
  const [captureOn, setCaptureOn] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const busy = status !== 'idle' && status !== 'error'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversation?.messages.length])

  async function handleSend(): Promise<void> {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    await ask(q, captureOn)
  }

  return (
    <>
      <div className="chat-scroll" ref={scrollRef}>
        {!conversation || conversation.messages.length === 0 ? (
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
          </div>
        ) : (
          <div className="chat-inner">
            {conversation.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          <button
            className={`composer-btn toggle ${captureOn ? 'on' : ''}`}
            title={captureOn ? 'Screen capture: on for this message' : 'Screen capture: off for this message'}
            onClick={() => setCaptureOn((v) => !v)}
          >
            👁 {captureOn ? 'Screen on' : 'Screen off'}
          </button>
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
          <button className="composer-btn primary" disabled={busy || !input.trim()} onClick={handleSend}>
            {busy ? '…' : 'Send'}
          </button>
        </div>
        <div className="status-line">
          {busy ? `${status[0].toUpperCase()}${status.slice(1)}…` : ''}
        </div>
      </div>
    </>
  )
}
