import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import MessageBubble from './MessageBubble'

const STATUS_LABEL: Record<string, string> = {
  idle: '',
  capturing: 'Capturing…',
  analyzing: 'Analyzing…',
  thinking: 'Thinking…',
  responding: 'Responding…',
  error: 'Something went wrong'
}

export default function CompanionApp(): JSX.Element {
  const loadInitial = useBuddyStore((s) => s.loadInitial)
  const loading = useBuddyStore((s) => s.loading)
  const status = useBuddyStore((s) => s.status)
  const conversations = useBuddyStore((s) => s.conversations)
  const activeConversationId = useBuddyStore((s) => s.activeConversationId)
  const ask = useBuddyStore((s) => s.ask)
  const newConversation = useBuddyStore((s) => s.newConversation)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const busy = status !== 'idle' && status !== 'error'

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    inputRef.current?.focus()
    const off = buddy().onTriggerAnalyze(async () => {
      // Hotkey-triggered analysis: start a fresh visual read of the current
      // screen. We don't send a canned question — instead we prefill and
      // focus the input so the user can immediately type or just hit Enter
      // for a default "what am I looking at?" read.
      inputRef.current?.focus()
    })
    return off
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') buddy().companion.hide()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversation?.messages.length])

  async function handleSend(captureScreen: boolean): Promise<void> {
    const q = input.trim() || (captureScreen ? "What's on my screen right now?" : '')
    if (!q || busy) return
    setInput('')
    if (!activeConversationId) await newConversation()
    await ask(q, captureScreen)
  }

  if (loading) return <div className="companion-root" />

  return (
    <div className="companion-root">
      <div className="companion-header">
        <div className="title">
          👁 Buddy {STATUS_LABEL[status] && <span style={{ color: 'var(--accent-text)' }}>· {STATUS_LABEL[status]}</span>}
        </div>
        <div className="actions">
          <button className="icon-btn" title="New chat" onClick={() => newConversation()}>
            ＋
          </button>
          <button className="icon-btn" title="Close (Esc)" onClick={() => buddy().companion.hide()}>
            ✕
          </button>
        </div>
      </div>

      <div className="companion-chat" ref={scrollRef}>
        {!conversation || conversation.messages.length === 0 ? (
          <div className="companion-empty">
            Ask me anything about your screen — I'll take a look and answer.
          </div>
        ) : (
          conversation.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <div className="companion-composer">
        <div className="row">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Ask about your screen…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend(true)
              }
            }}
          />
          <button className="icon-btn" title="Send without a new capture" onClick={() => handleSend(false)}>
            💬
          </button>
          <button className="icon-btn" title="Capture screen and ask" onClick={() => handleSend(true)} disabled={busy}>
            👁
          </button>
        </div>
      </div>
    </div>
  )
}
