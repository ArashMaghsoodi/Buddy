import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getMessagePreviewText,
  isAssistantLoadingPlaceholder,
  shouldHideEmptyAssistantMessage,
  shouldShowStatusBubble
} from '../src/shared/messageUi.ts'

test('hides empty assistant placeholders while a response is in flight', () => {
  const message = {
    id: 'assistant-1',
    parentId: null,
    role: 'assistant' as const,
    content: '',
    error: null,
    createdAt: Date.now()
  }

  assert.equal(shouldHideEmptyAssistantMessage(message, 'thinking', false), true)
  assert.equal(shouldHideEmptyAssistantMessage(message, 'idle', false), false)
})

test('shows status bubble once when the app is busy and the last assistant message has no content', () => {
  assert.equal(
    shouldShowStatusBubble({
      status: 'thinking',
      requestActive: false,
      cancelRequested: false,
      hasLiveAssistantOutput: false,
      isCompanion: false
    }),
    true
  )
  assert.equal(
    shouldShowStatusBubble({
      status: 'idle',
      requestActive: false,
      cancelRequested: false,
      hasLiveAssistantOutput: false,
      isCompanion: false
    }),
    false
  )
  assert.equal(
    shouldShowStatusBubble({
      status: 'thinking',
      requestActive: true,
      cancelRequested: false,
      hasLiveAssistantOutput: false,
      isCompanion: false
    }),
    true
  )
})

test('treats assistant loading dots as a real placeholder message, not an empty one', () => {
  assert.equal(isAssistantLoadingPlaceholder('.'), true)
  assert.equal(isAssistantLoadingPlaceholder('..'), true)
  assert.equal(isAssistantLoadingPlaceholder('...'), true)
  assert.equal(isAssistantLoadingPlaceholder('hello'), false)
  assert.equal(shouldHideEmptyAssistantMessage({ role: 'assistant', content: '..', error: undefined }, 'thinking', false), false)
})

test('shows a thinking label for an in-flight assistant node in the tree', () => {
  const message = {
    role: 'assistant' as const,
    content: '',
    error: null
  }

  assert.equal(getMessagePreviewText(message, 'thinking', true), 'Thinking…')
  assert.equal(getMessagePreviewText(message, 'idle', false), '(empty message)')
})
