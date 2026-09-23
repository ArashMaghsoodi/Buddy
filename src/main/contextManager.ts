import { nanoid } from 'nanoid'
import type { ScreenshotRef } from '@shared/types'

/**
 * Holds recent visual context per conversation, in memory only.
 *
 * This is the "the screen is context" piece: a screenshot captured for one
 * question stays available for follow-ups in the same conversation until it
 * is pruned. Screenshots are never written to disk unless the user's
 * privacy setting explicitly allows persisting them (handled by the store
 * layer, not here) — by default this manager is the only place screenshot
 * bytes live, and it's cleared on app quit.
 */
class ContextManager {
  private screenshotsByConversation = new Map<string, ScreenshotRef[]>()

  addScreenshot(
    conversationId: string,
    dataUrl: string,
    meta: { activeApp?: string; windowTitle?: string; ocrText?: string | null },
    retentionCount: number
  ): ScreenshotRef {
    const ref: ScreenshotRef = {
      id: nanoid(),
      createdAt: Date.now(),
      dataUrl,
      activeApp: meta.activeApp,
      windowTitle: meta.windowTitle,
      ocrText: meta.ocrText ?? null
    }
    const list = this.screenshotsByConversation.get(conversationId) ?? []
    list.push(ref)
    // Keep only the most recent N — older ones are dropped (not summarized
    // yet; a text summary step can be added here later without touching
    // callers).
    while (list.length > Math.max(1, retentionCount)) {
      list.shift()
    }
    this.screenshotsByConversation.set(conversationId, list)
    return ref
  }

  /** The most recent screenshot for a conversation, used to resolve "this", "why", etc. */
  latest(conversationId: string): ScreenshotRef | undefined {
    const list = this.screenshotsByConversation.get(conversationId)
    return list && list.length > 0 ? list[list.length - 1] : undefined
  }

  clear(conversationId: string): void {
    this.screenshotsByConversation.delete(conversationId)
  }

  clearAll(): void {
    this.screenshotsByConversation.clear()
  }
}

export const contextManager = new ContextManager()
