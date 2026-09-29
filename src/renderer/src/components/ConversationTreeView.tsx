import { useEffect, useRef, useState } from 'react'
import { useBuddyStore } from '../state/store'
import { AlertTriangle, GitBranch, Trash2 } from 'lucide-react'
import { getActivePath, getMessageChildren, getSubtreeMessageIds } from '@shared/conversationTree'
import { getMessagePreviewText } from '@shared/messageUi'
import type { ChatMessage, Conversation } from '@shared/types'
import ConversationGraphView from './ConversationGraphView'

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
          data-tooltip="Branch from here"
          data-tooltip-placement="above-end"
          aria-label="Branch from here"
          onClick={() => onBranch(message.id)}
        >
          <GitBranch size={14} />
        </button>
        <button
          type="button"
          className="tree-action danger"
          data-tooltip="Delete this message and its descendants"
          data-tooltip-placement="above-end"
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
  const [layout, setLayout] = useState<'outline' | 'graph'>('outline')
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const keepBranchRef = useRef<HTMLButtonElement>(null)
  const conversations = useBuddyStore((state) => state.conversations)
  const activeConversationId = useBuddyStore((state) => state.activeConversationId)
  const selectMessage = useBuddyStore((state) => state.selectMessage)
  const branchFrom = useBuddyStore((state) => state.branchFrom)
  const deleteSubtree = useBuddyStore((state) => state.deleteSubtree)
  const conversation = conversations.find((item) => item.id === activeConversationId)
  const activeIds = new Set(conversation ? getActivePath(conversation).map((message) => message.id) : [])
  const deleteMessageCount = conversation && deleteTarget
    ? getSubtreeMessageIds(conversation, deleteTarget.id).size
    : 0

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!deleteTarget || !dialog || dialog.open) return
    dialog.showModal()
    keepBranchRef.current?.focus()
  }, [deleteTarget])

  function handleDelete(message: ChatMessage): void {
    setDeleteTarget(message)
  }

  function closeDeleteDialog(): void {
    if (deleteDialogRef.current?.open) deleteDialogRef.current.close()
    setDeleteTarget(null)
  }

  function confirmDelete(): void {
    if (!deleteTarget) return
    const messageId = deleteTarget.id
    closeDeleteDialog()
    void deleteSubtree(messageId)
  }

  return (
    <section className={`tree-view ${layout === 'graph' ? 'graph-layout' : ''}`} aria-label="Conversation tree">
      <header className="tree-header">
        <div className="tree-header-title">
          <h1>Conversation tree</h1>
          <span>{conversation?.messages.length ?? 0} messages</span>
        </div>
        <div className="tree-layout-tabs" role="tablist" aria-label="Conversation tree layout">
          <button
            type="button"
            role="tab"
            id="tree-outline-tab"
            aria-controls="tree-outline-panel"
            aria-selected={layout === 'outline'}
            tabIndex={layout === 'outline' ? 0 : -1}
            className={layout === 'outline' ? 'active' : ''}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              setLayout('graph')
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#tree-graph-tab')?.focus()
            }}
            onClick={() => setLayout('outline')}
          >
            Outline
          </button>
          <button
            type="button"
            role="tab"
            id="tree-graph-tab"
            aria-controls="tree-graph-panel"
            aria-selected={layout === 'graph'}
            tabIndex={layout === 'graph' ? 0 : -1}
            className={layout === 'graph' ? 'active' : ''}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              setLayout('outline')
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('#tree-outline-tab')?.focus()
            }}
            onClick={() => setLayout('graph')}
          >
            Graph
          </button>
        </div>
      </header>
      {!conversation || conversation.messages.length === 0 ? (
        <p
          id={layout === 'outline' ? 'tree-outline-panel' : 'tree-graph-panel'}
          className="tree-empty"
          role="tabpanel"
          aria-labelledby={layout === 'outline' ? 'tree-outline-tab' : 'tree-graph-tab'}
          tabIndex={0}
        >
          No messages in this conversation yet.
        </p>
      ) : layout === 'graph' ? (
        <ConversationGraphView
          conversation={conversation}
          activeIds={activeIds}
          onSelect={(messageId) => void selectMessage(messageId)}
          onBranch={(messageId) => void branchFrom(messageId)}
          onDelete={(messageId) => {
            const message = conversation.messages.find((item) => item.id === messageId)
            if (message) handleDelete(message)
          }}
        />
      ) : (
        <div id="tree-outline-panel" role="tabpanel" aria-labelledby="tree-outline-tab" tabIndex={0}>
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
        </div>
      )}
      <dialog
        ref={deleteDialogRef}
        className="branch-delete-dialog"
        aria-labelledby="branch-delete-title"
        aria-describedby="branch-delete-description branch-delete-preview"
        onClose={() => setDeleteTarget(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDeleteDialog()
        }}
      >
        {deleteTarget && (
          <>
            <div className="branch-delete-heading">
              <div className="branch-delete-title-row">
                <span className="branch-delete-icon" aria-hidden="true">
                  <AlertTriangle size={18} />
                </span>
                <h2 id="branch-delete-title">Delete this branch?</h2>
              </div>
              <p id="branch-delete-description">
                This will permanently delete {deleteMessageCount} message{deleteMessageCount === 1 ? '' : 's'}
                {conversation ? ` from "${conversation.title}"` : ''}, including everything below the selected message.
                {' '}This cannot be undone.
              </p>
            </div>
            <div className="branch-delete-preview">
              <span>Branch starts with</span>
              <p id="branch-delete-preview">
                {deleteTarget.content.trim() || `(${deleteTarget.role} message with no text)`}
              </p>
            </div>
            <footer className="branch-delete-actions">
              <button ref={keepBranchRef} type="button" className="branch-delete-cancel" onClick={closeDeleteDialog}>
                Keep branch
              </button>
              <button type="button" className="branch-delete-confirm" onClick={confirmDelete}>
                <Trash2 size={14} />
                Delete branch
              </button>
            </footer>
          </>
        )}
      </dialog>
    </section>
  )
}