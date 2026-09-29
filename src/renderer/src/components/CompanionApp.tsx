import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import { Galaxy, Loader2, ExternalLink, BookText, Minus, Plus, Send, Square, X } from 'lucide-react'
import MessageBubble from './MessageBubble'
import CapturePicker from './CapturePicker'
import { getActivePath, getSiblings } from '@shared/conversationTree'
import { isRequestBusy, shouldHideEmptyAssistantMessage } from '@shared/messageUi'

type CompanionMode = 'fab' | 'overlay'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready',
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
  const overlayOpacity = useBuddyStore((s) => s.settings?.appearance.overlayOpacity ?? 0.98)
  const activeConversationId = useBuddyStore((s) => s.activeConversationId)
  const selectConversation = useBuddyStore((s) => s.selectConversation)
  const ask = useBuddyStore((s) => s.ask)
  const selectSibling = useBuddyStore((s) => s.selectSibling)
  const branchFrom = useBuddyStore((s) => s.branchFrom)
  const editMessage = useBuddyStore((s) => s.editMessage)
  const regenerateMessage = useBuddyStore((s) => s.regenerateMessage)
  const newConversation = useBuddyStore((s) => s.newConversation)
  const [mode, setMode] = useState<CompanionMode>('fab')
  const [input, setInput] = useState('')
  const [requestActive, setRequestActive] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false)
  const [conversationQuery, setConversationQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationPickerRef = useRef<HTMLDivElement>(null)
  const conversationSearchRef = useRef<HTMLInputElement>(null)
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
  const activePath = conversation ? getActivePath(conversation) : []
  const busy = isRequestBusy(status, requestActive)
  const filteredConversations = conversations.filter((item) => {
    const query = conversationQuery.trim().toLocaleLowerCase()
    return !query || item.title.toLocaleLowerCase().includes(query)
      || item.messages.some((message) => message.content.toLocaleLowerCase().includes(query))
  })

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
    if (conversationPickerOpen) conversationSearchRef.current?.focus()
  }, [conversationPickerOpen])

  useEffect(() => {
    if (!conversationPickerOpen) return
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!conversationPickerRef.current?.contains(event.target as Node)) {
        setConversationPickerOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [conversationPickerOpen])

  useEffect(() => {
    const off = buddy().onTriggerAnalyze(() => {
      inputRef.current?.focus()
    })
    return off
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || mode !== 'overlay') return
      if (conversationPickerOpen) {
        setConversationPickerOpen(false)
        setConversationQuery('')
      } else {
        buddy().companion.collapse()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [conversationPickerOpen, mode])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeConversationId, conversation?.messages.length])

  async function handleSend(): Promise<void> {
    const q = input.trim() || "What's on my screen right now?"
    if (!q || busy) return
    setInput('')
    setRequestActive(true)
    setCancelRequested(false)
    try {
      if (!activeConversationId) await newConversation()
      await ask(q, true)
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
        data-tooltip="Ask Buddy about your screen"
        data-tooltip-placement="above-end"
        aria-label="Ask Buddy about your screen"
      >
        <Galaxy size={20} />
      </button>
    )
  }

  // ---- Expanded state: compact chat overlay ----
  return (
    <div className="companion-root" style={{ backgroundColor: `rgba(23, 23, 27, ${overlayOpacity})` }}>
      <div className="companion-header">
        <div className="title">
          <Galaxy size={16} />
          <span>Buddy</span>
          <span className={`status-dot ${status === 'idle' ? '' : status === 'error' ? 'error' : 'busy'}`} />
          <span className="status-label">{STATUS_LABEL[status] ?? status}</span>
        </div>
        <div className="actions" ref={conversationPickerRef}>
          <button
            className={`icon-btn ${conversationPickerOpen ? 'active' : ''}`}
            data-tooltip="Choose conversation"
            data-tooltip-placement="below-end"
            aria-label="Choose conversation"
            aria-expanded={conversationPickerOpen}
            aria-controls="companion-conversation-picker"
            onClick={() => setConversationPickerOpen((open) => !open)}
          >
            <BookText size={15} />
          </button>
          <button className="icon-btn" data-tooltip="New chat" data-tooltip-placement="below-end" aria-label="New chat" onClick={() => {
            setConversationPickerOpen(false)
            setConversationQuery('')
            void newConversation()
          }}>
            <Plus size={16} />
          </button>
          <button className="icon-btn" data-tooltip="Open in full window" data-tooltip-placement="below-end" aria-label="Open in full window" onClick={handleOpenInNewWindow}>
            <ExternalLink size={15} />
          </button>
          <button className="icon-btn" data-tooltip="Collapse to floating button" data-tooltip-placement="below-end" aria-label="Collapse to floating button" onClick={() => buddy().companion.collapse()}>
            <Minus size={16} />
          </button>
          <button className="icon-btn" data-tooltip="Dismiss" data-tooltip-placement="below-end" aria-label="Dismiss" onClick={() => buddy().companion.hide()}>
            <X size={16} />
          </button>
          {conversationPickerOpen && (
            <div id="companion-conversation-picker" className="companion-history-picker" role="dialog" aria-label="Choose a conversation">
              <input
                ref={conversationSearchRef}
                type="search"
                className="companion-history-search"
                aria-label="Search conversations"
                placeholder="Search conversations..."
                value={conversationQuery}
                onChange={(event) => setConversationQuery(event.target.value)}
              />
              <div className="companion-history-list" aria-label="Conversations">
                {filteredConversations.length === 0 ? (
                  <p className="companion-history-empty">No matching conversations</p>
                ) : (
                  filteredConversations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`companion-history-item ${item.id === activeConversationId ? 'active' : ''}`}
                      aria-current={item.id === activeConversationId ? 'true' : undefined}
                      onClick={() => {
                        void selectConversation(item.id)
                        setConversationPickerOpen(false)
                        setConversationQuery('')
                      }}
                    >
                      <span>{item.title || 'New conversation'}</span>
                      <small>{item.messages.length} messages</small>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="companion-chat" ref={scrollRef}>
        {!conversation || activePath.length === 0 ? (
          <div className="companion-empty">
            Ask me anything about your screen — I'll take a look and answer.
          </div>
        ) : (
          activePath
            .filter((m) => !shouldHideEmptyAssistantMessage(m, status, requestActive, cancelRequested))
            .map((m) => {
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
            })
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
    </div>
  )
}
