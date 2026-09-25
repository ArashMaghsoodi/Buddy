import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import MessageBubble from './MessageBubble'
import CapturePicker from './CapturePicker'

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
  const [captureOn, setCaptureOn] = useState(true)
  const [requestActive, setRequestActive] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fabDragRef = useRef<{
    startX: number
    startY: number
    lastX: number
    lastY: number
    originX: number
    originY: number
    ready: boolean
    moved: boolean
  } | null>(null)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const busy = requestActive || (status !== 'idle' && status !== 'error')

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

  async function handleSend(): Promise<void> {
    const q = input.trim() || (captureOn ? "What's on my screen right now?" : '')
    if (!q || busy) return
    setInput('')
    setRequestActive(true)
    setCancelRequested(false)
    try {
      if (!activeConversationId) await newConversation()
      await ask(q, captureOn)
    } finally {
      setRequestActive(false)
    }
  }

  function handleCancel(): void {
    if (!busy || cancelRequested) return
    setCancelRequested(true)
    void buddy().cancel()
  }

  async function handleOpenInNewWindow(): Promise<void> {
    if (activeConversationId) {
      await buddy().mainWindow.openConversation(activeConversationId)
    } else {
      await buddy().mainWindow.openConversation('')
    }
  }

  async function handleFabPointerDown(e: React.PointerEvent<HTMLButtonElement>): Promise<void> {
    if (mode !== 'fab' || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const drag = {
      startX: e.screenX,
      startY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      originX: 0,
      originY: 0,
      ready: false,
      moved: false
    }
    fabDragRef.current = drag
    const [originX, originY] = await buddy().companion.getPosition()
    if (fabDragRef.current !== drag) return
    drag.originX = originX
    drag.originY = originY
    drag.ready = true
    if (drag.moved) void buddy().companion.setPosition(originX + drag.lastX - drag.startX, originY + drag.lastY - drag.startY)
  }

  function handleFabPointerMove(e: React.PointerEvent<HTMLButtonElement>): void {
    const drag = fabDragRef.current
    if (!drag) return
    drag.lastX = e.screenX
    drag.lastY = e.screenY
    const deltaX = e.screenX - drag.startX
    const deltaY = e.screenY - drag.startY
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) drag.moved = true
    if (drag.ready && drag.moved) void buddy().companion.setPosition(drag.originX + deltaX, drag.originY + deltaY)
  }

  function handleFabPointerUp(e: React.PointerEvent<HTMLButtonElement>): void {
    if (!fabDragRef.current) return
    const moved = fabDragRef.current.moved
    fabDragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!moved) void buddy().companion.expand()
  }

  if (loading) return <div />

  // ---- Collapsed state: a small, unobtrusive floating action button ----
  if (mode === 'fab') {
    return (
      <button
        className={`fab-button ${busy ? 'busy' : ''}`}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        title="Ask Buddy about your screen"
      >
        👀
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
          <button className="icon-btn" title="Open in full window" onClick={handleOpenInNewWindow}>
            ⤢
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
                handleSend()
              }
            }}
          />
          <button
            className={`composer-btn toggle ${captureOn ? 'on' : ''}`}
            title={captureOn ? 'Capture on' : 'Capture off'}
            onClick={() => setCaptureOn((v) => !v)}
          >
            👁
          </button>
          <CapturePicker />
          <button
            className={`composer-btn primary ${busy ? 'cancel-btn' : ''}`}
            disabled={busy ? cancelRequested : !input.trim()}
            title={busy ? 'Cancel response' : 'Send message'}
            onClick={busy ? handleCancel : handleSend}
          >
            {busy ? (cancelRequested ? '…' : '■') : '➤'}
          </button>
        </div>
      </div>
    </div>
  )
}
