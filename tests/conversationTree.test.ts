import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendMessage,
  getActivePath,
  getSiblings,
  normalizeConversation,
  selectSibling
} from '../src/shared/conversationTree.ts'
import type { ChatMessage, Conversation } from '../src/shared/types.ts'

function createConversation(messages: ChatMessage[] = []): Conversation {
  return {
    id: 'conversation',
    title: 'Test',
    createdAt: 1,
    updatedAt: 1,
    provider: 'openrouter',
    model: 'test-model',
    messages,
    selectedChildren: {},
    activeMessageId: messages.at(-1)?.id ?? null,
    branchDraftParentId: null
  }
}

function message(id: string, role: ChatMessage['role'], parentId: string | null): ChatMessage {
  return { id, role, parentId, content: id, createdAt: Number(id.replace(/\D/g, '')) || 1 }
}

describe('conversation tree paths', () => {
  it('normalizes a legacy linear conversation into a single path', () => {
    const legacyMessage = (id: string, role: ChatMessage['role']): ChatMessage => {
      const { parentId: omittedParentId, ...legacy } = message(id, role, null)
      void omittedParentId
      return legacy as ChatMessage
    }
    const legacy = createConversation([
      legacyMessage('u1', 'user'),
      legacyMessage('a1', 'assistant')
    ])
    const normalized = normalizeConversation(legacy)

    assert.deepEqual(normalized.messages.map((item) => item.parentId), [null, 'u1'])
    assert.deepEqual(getActivePath(normalized).map((item) => item.id), ['u1', 'a1'])
  })

  it('does not treat an assistant response and next user turn as siblings', () => {
    const conversation = createConversation()
    appendMessage(conversation, message('u1', 'user', null), null)
    appendMessage(conversation, message('a1', 'assistant', null))
    appendMessage(conversation, message('u2', 'user', null))

    assert.deepEqual(getSiblings(conversation, 'u2').map((item) => item.id), ['u2'])
    assert.deepEqual(getActivePath(conversation).map((item) => item.id), ['u1', 'a1', 'u2'])
  })

  it('switches to a sibling and follows that sibling continuation', () => {
    const conversation = createConversation()
    appendMessage(conversation, message('u1', 'user', null), null)
    appendMessage(conversation, message('a1', 'assistant', null))
    appendMessage(conversation, message('u2a', 'user', null))
    appendMessage(conversation, message('a2a', 'assistant', null))
    appendMessage(conversation, message('u2b', 'user', null), 'a1')
    appendMessage(conversation, message('a2b', 'assistant', null))
    conversation.activeMessageId = 'a2a'

    assert.equal(selectSibling(conversation, 'u2a', 1), true)
    assert.deepEqual(getActivePath(conversation).map((item) => item.id), ['u1', 'a1', 'u2b', 'a2b'])
  })
})