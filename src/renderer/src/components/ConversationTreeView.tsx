import { useBuddyStore } from '../state/store'
import { GitBranch, Trash2 } from 'lucide-react'
import { getActivePath, getMessageChildren } from '@shared/conversationTree'
import { getMessagePreviewText } from '@shared/messageUi'
import type { ChatMessage, Conversation } from '@shared/types'

interface TreeNodeProps {
  message: ChatMessage
  conversation: Conversation
  activeIds: Set<string>
  onSelect: (messageId: string) => void
  onBranch: (messageId: string) => void
  onDelete: (messageId: string) => void
}

function TreeNode({ message, conversation, activeIds, onSelect, onBranch, onDelete }: TreeNodeProps): JSX.Element {
  const children = getMessageChildren(conversation, message.id)
  const preview = getMessagePreviewText(message, 'idle', false)

  return (
    <li className="tree-item">
      <div className={`tree-node-row ${activeIds.has(message.id) ? 'active' : ''}`}>
        <button
          type="button"
          className="tree-node-select"
          aria-current={activeIds.has(message.id) ? 'location' : undefined}
          onClick={() => onSelect(message.id)}
        >
          <span className={`tree-role ${message.role}`}>{message.role}</span>
          <span className="tree-preview">{preview}</span>
        </button>
        <button
          type="button"
          className="tree-action"
          title="Branch from here"
          aria-label="Branch from here"
          onClick={() => onBranch(message.id)}
        >
          <GitBranch size={14} />
        </button>
        <button
          type="button"
          className="tree-action danger"
          title="Delete this message and its descendants"
          aria-label="Delete subtree"
          onClick={() => onDelete(message.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {children.length > 0 && (
        <ul className="tree-list">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              message={child}
              conversation={conversation}
              activeIds={activeIds}
              onSelect={onSelect}
              onBranch={onBranch}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function ConversationTreeView(): JSX.Element {
  const conversations = useBuddyStore((state) => state.conversations)
  const activeConversationId = useBuddyStore((state) => state.activeConversationId)
  const selectMessage = useBuddyStore((state) => state.selectMessage)
  const branchFrom = useBuddyStore((state) => state.branchFrom)
  const deleteSubtree = useBuddyStore((state) => state.deleteSubtree)
  const conversation = conversations.find((item) => item.id === activeConversationId)
  const activeIds = new Set(conversation ? getActivePath(conversation).map((message) => message.id) : [])

  function handleDelete(message: ChatMessage): void {
    const label = message.content.trim().slice(0, 80) || message.role
    if (!window.confirm(`Delete this message and everything below it?\n\n${label}`)) return
    void deleteSubtree(message.id)
  }

  return (
    <section className="tree-view" aria-label="Conversation tree">
      <header className="tree-header">
        <h1>Conversation tree</h1>
        <span>{conversation?.messages.length ?? 0} messages</span>
      </header>
      {!conversation || conversation.messages.length === 0 ? (
        <p className="tree-empty">No messages in this conversation yet.</p>
      ) : (
        <ul className="tree-list tree-root-list">
          {getMessageChildren(conversation, null).map((message) => (
            <TreeNode
              key={message.id}
              message={message}
              conversation={conversation}
              activeIds={activeIds}
              onSelect={(messageId) => void selectMessage(messageId)}
              onBranch={(messageId) => void branchFrom(messageId)}
              onDelete={(messageId) => handleDelete(conversation.messages.find((item) => item.id === messageId)!)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}