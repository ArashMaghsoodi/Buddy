import { useMemo, useState } from 'react'
import { useBuddyStore } from '../state/store'

interface Props {
  view: 'chat' | 'settings'
  onChangeView: (v: 'chat' | 'settings') => void
}

export default function Sidebar({ view, onChangeView }: Props): JSX.Element {
  const conversations = useBuddyStore((s) => s.conversations)
  const activeId = useBuddyStore((s) => s.activeConversationId)
  const selectConversation = useBuddyStore((s) => s.selectConversation)
  const newConversation = useBuddyStore((s) => s.newConversation)
  const deleteConversation = useBuddyStore((s) => s.deleteConversation)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations
    const q = query.toLowerCase()
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  }, [conversations, query])

  return (
    <div className="sidebar">
      <button
        className="sidebar-new-btn"
        onClick={async () => {
          await newConversation()
          onChangeView('chat')
        }}
      >
        <span>＋</span> New conversation
      </button>

      <input
        className="sidebar-search"
        placeholder="Search conversations…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="sidebar-section-label">History</div>
      <div className="sidebar-list">
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: 12, padding: '8px 10px' }}>
            {query ? 'No matches.' : 'No conversations yet.'}
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`sidebar-item ${view === 'chat' && c.id === activeId ? 'active' : ''}`}
            onClick={() => {
              selectConversation(c.id)
              onChangeView('chat')
            }}
          >
            <span>{c.title || 'New conversation'}</span>
            <button
              className="del-btn"
              onClick={(e) => {
                e.stopPropagation()
                deleteConversation(c.id)
              }}
              title="Delete conversation"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className="nav-btn"
          style={view === 'settings' ? { color: 'var(--text-0)', background: 'var(--bg-2)' } : {}}
          onClick={() => onChangeView('settings')}
        >
          ⚙ Settings
        </button>
      </div>
    </div>
  )
}
