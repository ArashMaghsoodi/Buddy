import { useMemo, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { GitFork, Plus, Search, Settings, Trash, X } from 'lucide-react'

interface Props {
  view: 'chat' | 'tree' | 'settings'
  onChangeView: (v: 'chat' | 'tree' | 'settings') => void
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
      <div className="sidebar-search-row">
        <button
          className="sidebar-new-btn"
          data-tooltip="New conversation"
          data-tooltip-placement="below-start"
          aria-label="New conversation"
          onClick={async () => {
            await newConversation()
            onChangeView('chat')
          }}
        >
          <Plus size={17} />
        </button>
        <div className="sidebar-search-wrap">
          <Search className="sidebar-search-icon" size={14} aria-hidden="true" />
          <input
            className="sidebar-search"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

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
            <span className="sidebar-item-title">{c.title || 'New conversation'}</span>
            <div className="sidebar-item-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="tree-btn"
                onClick={() => {
                  selectConversation(c.id)
                  onChangeView('tree')
                }}
                data-tooltip="Open conversation tree"
                data-tooltip-placement="above-end"
                aria-label="Open conversation tree"
              >
                <GitFork size={13} />
              </button>
              <button
                className="del-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(c.id)
                }}
                data-tooltip="Delete conversation"
                data-tooltip-placement="above-end"
                aria-label="Delete conversation"
              >
                <Trash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className="nav-btn"
          style={view === 'settings' ? { color: 'var(--text-0)', background: 'var(--bg-2)' } : {}}
          onClick={() => onChangeView('settings')}
        >
          <Settings size={15} /> Settings
        </button>
      </div>
    </div>
  )
}
