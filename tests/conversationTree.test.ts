import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendMessage,
  getActivePath,
  getSiblings,
  normalizeConversation,
  selectSibling
} from '../src/shared/conversationTree.ts'
import { GRAPH_NODE_WIDTH, GRAPH_HORIZONTAL_GAP, layoutConversationGraph } from '../src/shared/conversationGraph.ts'
import { isRequestBusy } from '../src/shared/messageUi.ts'
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

describe('busy states', () => {
  it('treats status-driven streaming as busy even when the local request flag is false', () => {
    assert.equal(isRequestBusy('thinking', false), true)
    assert.equal(isRequestBusy('responding', false), true)
    assert.equal(isRequestBusy('idle', false), false)
  })
})

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

describe('conversation graph layout', () => {
  it('returns an empty canvas for a conversation without messages', () => {
    const layout = layoutConversationGraph(createConversation())

    assert.deepEqual(layout.nodes, [])
    assert.deepEqual(layout.edges, [])
    assert.deepEqual(layout.bounds, { width: 0, height: 0 })
  })

  it('places a linear conversation in stable top-to-bottom order', () => {
    const conversation = createConversation([
      message('u1', 'user', null),
      message('a1', 'assistant', 'u1'),
      message('u2', 'user', 'a1')
    ])
    const layout = layoutConversationGraph(conversation)

    assert.deepEqual(layout.nodes.map((node) => node.message.id), ['u1', 'a1', 'u2'])
    assert.deepEqual(layout.nodes.map((node) => node.depth), [0, 1, 2])
    assert.ok(layout.nodes[0].y < layout.nodes[1].y)
    assert.ok(layout.nodes[1].y < layout.nodes[2].y)
    assert.equal(layout.nodes[0].x, layout.nodes[1].x)
    assert.deepEqual(layout.edges, [
      { from: 'u1', to: 'a1' },
      { from: 'a1', to: 'u2' }
    ])
  })

  it('places regenerated sibling responses side by side on the same depth row', () => {
    const conversation = createConversation([
      message('u1', 'user', null),
      message('a1', 'assistant', 'u1'),
      message('a2', 'assistant', 'u1')
    ])
    const layout = layoutConversationGraph(conversation)
    const firstResponse = layout.nodes.find((node) => node.message.id === 'a1')!
    const secondResponse = layout.nodes.find((node) => node.message.id === 'a2')!

    assert.equal(firstResponse.depth, secondResponse.depth)
    assert.equal(firstResponse.y, secondResponse.y)
    assert.ok(firstResponse.x < secondResponse.x)
    assert.ok(secondResponse.x - firstResponse.x >= GRAPH_NODE_WIDTH + GRAPH_HORIZONTAL_GAP)
    assert.deepEqual(layout.edges, [
      { from: 'u1', to: 'a1' },
      { from: 'u1', to: 'a2' }
    ])
  })

  it('keeps the child subtrees of sibling responses in separate horizontal slots', () => {
    const conversation = createConversation([
      message('u1', 'user', null),
      message('a1', 'assistant', 'u1'),
      message('a2', 'assistant', 'u1'),
      message('u2a', 'user', 'a1'),
      message('u2b', 'user', 'a2')
    ])
    const layout = layoutConversationGraph(conversation)
    const firstBranch = layout.nodes.find((node) => node.message.id === 'u2a')!
    const secondBranch = layout.nodes.find((node) => node.message.id === 'u2b')!

    assert.ok(secondBranch.x - firstBranch.x >= GRAPH_NODE_WIDTH + GRAPH_HORIZONTAL_GAP)
  })

  it('does not promote messages with missing parents to graph roots', () => {
    const conversation = createConversation([
      message('u1', 'user', null),
      message('a1', 'assistant', 'u1'),
      message('orphan', 'assistant', 'missing-parent')
    ])
    const layout = layoutConversationGraph(conversation)

    assert.deepEqual(layout.nodes.map((node) => node.message.id), ['u1', 'a1'])
  })
})