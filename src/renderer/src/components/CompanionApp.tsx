import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import MessageBubble from './MessageBubble'

type CompanionMode = 'fab' | 'overlay'

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
  const [mode, setMode] = useState<CompanionMode>('fab')
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const busy = status !== 'idle' && status !== 'error'

  useEffect(() => {
    loadInitial()
    buddy()
      .companion.getMode()
      .then(setMode)
      .catch(() => {})
  }, [loadInitial])

  useEffect(() => {
    const off = buddy().companion.onModeChange((m) => setMode(m))
    return off
  }, [])

  useEffect(() => {
    if (mode === 'overlay') inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const off = buddy().onTriggerAnalyze(() => {
      inputRef.current?.focus()
    })
    return off
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'overlay') buddy().companion.collapse()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode])

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

  if (loading) return <div />

  // ---- Collapsed state: a small, unobtrusive floating action button ----
  if (mode === 'fab') {
    return (
      <button
        className={`fab-button ${busy ? 'busy' : ''}`}
        onClick={() => buddy().companion.expand()}
        title="Ask Buddy about your screen"
      >
        👁
      </button>
    )
  }

  // ---- Expanded state: compact chat overlay ----
  return (
    <div className="companion-root">
      <div className="companion-header">
        <div className="title">
          👁 Buddy{' '}
          {STATUS_LABEL[status] && <span style={{ color: 'var(--accent-text)' }}>· {STATUS_LABEL[status]}</span>}
        </div>
        <div className="actions">
          <button className="icon-btn" title="New chat" onClick={() => newConversation()}>
            ＋
          </button>
          <button className="icon-btn" title="Collapse to floating button" onClick={() => buddy().companion.collapse()}>
            –
          </button>
          <button className="icon-btn" title="Dismiss" onClick={() => buddy().companion.hide()}>
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
