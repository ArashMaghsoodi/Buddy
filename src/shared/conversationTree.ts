import type { ChatMessage, Conversation } from './types'

export const ROOT_PARENT_KEY = '$root'

export function normalizeConversation(conversation: Conversation): Conversation {
  let previousId: string | null = null
  let messagesChanged = false
  const messages = conversation.messages.map((message) => {
    const hasParent = Object.prototype.hasOwnProperty.call(message, 'parentId')
    const parentId = hasParent ? message.parentId : previousId
    previousId = message.id
    if (hasParent) return message
    messagesChanged = true
    return { ...message, parentId }
  })

  const messageIds = new Set(messages.map((message) => message.id))
  const selectedChildren = Object.fromEntries(
    Object.entries(conversation.selectedChildren ?? {}).filter(([parentKey, childId]) => {
      const child = messages.find((message) => message.id === childId)
      const parentId = parentKey === ROOT_PARENT_KEY ? null : parentKey
      return child != null && child.parentId === parentId && (parentId == null || messageIds.has(parentId))
    })
  )
  const activeMessageId = messageIds.has(conversation.activeMessageId ?? '')
    ? conversation.activeMessageId
    : messages.at(-1)?.id ?? null
  if (activeMessageId) {
    const path = getPathToMessage({ ...conversation, messages }, activeMessageId)
    let parentId: string | null = null
    for (const message of path) {
      const key = parentId ?? ROOT_PARENT_KEY
      if (!(key in selectedChildren)) selectedChildren[key] = message.id
      parentId = message.id
    }
  }
  const branchDraftParentId = messageIds.has(conversation.branchDraftParentId ?? '')
    ? conversation.branchDraftParentId
    : null
  const treeStateChanged =
    conversation.selectedChildren == null ||
    JSON.stringify(selectedChildren) !== JSON.stringify(conversation.selectedChildren) ||
    conversation.activeMessageId !== activeMessageId ||
    conversation.branchDraftParentId !== branchDraftParentId

  if (!messagesChanged && !treeStateChanged) return conversation
  return { ...conversation, messages, selectedChildren, activeMessageId, branchDraftParentId }
}

export function getMessageChildren(conversation: Conversation, parentId: string | null): ChatMessage[] {
  return conversation.messages.filter((message) => message.parentId === parentId)
}

export function getPathToMessage(conversation: Conversation, messageId: string): ChatMessage[] {
  const byId = new Map(conversation.messages.map((message) => [message.id, message]))
  const path: ChatMessage[] = []
  const visited = new Set<string>()
  let current = byId.get(messageId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

export function getActivePath(conversation: Conversation): ChatMessage[] {
  if (conversation.activeMessageId === null) return []
  const endId = conversation.activeMessageId ?? conversation.messages.at(-1)?.id
  if (!endId) return []
  return getPathToMessage(conversation, endId)
}

export function setActiveMessage(conversation: Conversation, messageId: string): void {
  const path = getPathToMessage(conversation, messageId)
  if (path.length === 0) return

  const selectedChildren = { ...conversation.selectedChildren }
  let parentId: string | null = null
  for (const message of path) {
    selectedChildren[parentId ?? ROOT_PARENT_KEY] = message.id
    parentId = message.id
  }
  conversation.selectedChildren = selectedChildren
  conversation.activeMessageId = messageId
  conversation.branchDraftParentId = null
}

export function appendMessage(
  conversation: Conversation,
  message: Omit<ChatMessage, 'parentId'> & { parentId?: string | null },
  parentId: string | null = conversation.activeMessageId
): ChatMessage {
  const appended: ChatMessage = { ...message, parentId }
  conversation.messages.push(appended)
  conversation.selectedChildren = {
    ...conversation.selectedChildren,
    [parentId ?? ROOT_PARENT_KEY]: appended.id
  }
  conversation.activeMessageId = appended.id
  conversation.branchDraftParentId = null
  return appended
}

export function getSiblings(conversation: Conversation, messageId: string): ChatMessage[] {
  const message = conversation.messages.find((candidate) => candidate.id === messageId)
  return message
    ? getMessageChildren(conversation, message.parentId).filter((sibling) => sibling.role === message.role)
    : []
}

export function selectSibling(conversation: Conversation, messageId: string, direction: -1 | 1): boolean {
  const siblings = getSiblings(conversation, messageId)
  const currentIndex = siblings.findIndex((message) => message.id === messageId)
  const target = siblings[currentIndex + direction]
  if (!target) return false

  const parentId = target.parentId
  conversation.selectedChildren = {
    ...conversation.selectedChildren,
    [parentId ?? ROOT_PARENT_KEY]: target.id
  }
  const continuation = getSelectedContinuation(conversation, target.id)
  setActiveMessage(conversation, continuation.at(-1)?.id ?? target.id)
  return true
}

export function getSelectedContinuation(conversation: Conversation, messageId: string): ChatMessage[] {
  const path = getPathToMessage(conversation, messageId)
  const byId = new Map(conversation.messages.map((message) => [message.id, message]))
  let current = byId.get(messageId)
  const visited = new Set(path.map((message) => message.id))

  while (current) {
    const children = getMessageChildren(conversation, current.id)
    if (children.length === 0) break
    const selectedId = conversation.selectedChildren[current.id]
    const next = children.find((child) => child.id === selectedId) ?? children[0]
    if (visited.has(next.id)) break
    visited.add(next.id)
    path.push(next)
    current = next
  }
  return path
}

export function getSubtreeMessageIds(conversation: Conversation, messageId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const message of conversation.messages) {
    if (!message.parentId) continue
    const children = childrenByParent.get(message.parentId) ?? []
    children.push(message.id)
    childrenByParent.set(message.parentId, children)
  }

  const ids = new Set<string>()
  const pending = [messageId]
  while (pending.length > 0) {
    const currentId = pending.pop()!
    if (ids.has(currentId)) continue
    ids.add(currentId)
    pending.push(...(childrenByParent.get(currentId) ?? []))
  }
  return ids
}

export function setBranchDraft(conversation: Conversation, messageId: string): boolean {
  if (!conversation.messages.some((message) => message.id === messageId)) return false
  setActiveMessage(conversation, messageId)
  conversation.branchDraftParentId = messageId
  return true
}