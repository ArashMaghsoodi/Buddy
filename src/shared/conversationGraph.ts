import type { ChatMessage, Conversation } from './types'

export const GRAPH_NODE_WIDTH = 220
export const GRAPH_NODE_HEIGHT = 50
export const GRAPH_HORIZONTAL_GAP = 36
export const GRAPH_VERTICAL_GAP = 64
export const GRAPH_PADDING = 32

export interface ConversationGraphNode {
  message: ChatMessage
  x: number
  y: number
  depth: number
}

export interface ConversationGraphEdge {
  from: string
  to: string
}

export interface ConversationGraphLayout {
  nodes: ConversationGraphNode[]
  edges: ConversationGraphEdge[]
  bounds: { width: number; height: number }
}

export function layoutConversationGraph(conversation: Conversation): ConversationGraphLayout {
  const childrenByParent = new Map<string | null, ChatMessage[]>()

  for (const message of conversation.messages) {
    const parentId = message.parentId ?? null
    const children = childrenByParent.get(parentId) ?? []
    children.push(message)
    childrenByParent.set(parentId, children)
  }

  const subtreeWidths = new Map<string, number>()
  function measureSubtree(message: ChatMessage): number {
    const children = childrenByParent.get(message.id) ?? []
    const childWidths = children.map(measureSubtree)
    const childrenWidth = childWidths.reduce((total, width) => total + width, 0)
      + Math.max(0, children.length - 1) * GRAPH_HORIZONTAL_GAP
    const width = Math.max(GRAPH_NODE_WIDTH, childrenWidth)
    subtreeWidths.set(message.id, width)
    return width
  }

  const roots = childrenByParent.get(null) ?? []
  const rootWidths = roots.map(measureSubtree)
  const graphWidth = rootWidths.reduce((total, width) => total + width, 0)
    + Math.max(0, roots.length - 1) * GRAPH_HORIZONTAL_GAP
  const nodes: ConversationGraphNode[] = []
  const edges: ConversationGraphEdge[] = []
  let maxDepth = 0

  function placeSubtree(message: ChatMessage, left: number, depth: number): void {
    const width = subtreeWidths.get(message.id) ?? GRAPH_NODE_WIDTH
    const x = left + (width - GRAPH_NODE_WIDTH) / 2
    const y = GRAPH_PADDING + depth * (GRAPH_NODE_HEIGHT + GRAPH_VERTICAL_GAP)
    nodes.push({ message, x, y, depth })
    maxDepth = Math.max(maxDepth, depth)

    const children = childrenByParent.get(message.id) ?? []
    const childrenWidth = children.reduce(
      (total, child) => total + (subtreeWidths.get(child.id) ?? GRAPH_NODE_WIDTH),
      0
    ) + Math.max(0, children.length - 1) * GRAPH_HORIZONTAL_GAP
    let childLeft = left + (width - childrenWidth) / 2

    for (const child of children) {
      edges.push({ from: message.id, to: child.id })
      placeSubtree(child, childLeft, depth + 1)
      childLeft += (subtreeWidths.get(child.id) ?? GRAPH_NODE_WIDTH) + GRAPH_HORIZONTAL_GAP
    }
  }

  let rootLeft = GRAPH_PADDING
  for (const root of roots) {
    placeSubtree(root, rootLeft, 0)
    rootLeft += (subtreeWidths.get(root.id) ?? GRAPH_NODE_WIDTH) + GRAPH_HORIZONTAL_GAP
  }

  if (nodes.length === 0) {
    return { nodes, edges, bounds: { width: 0, height: 0 } }
  }

  return {
    nodes,
    edges,
    bounds: {
      width: graphWidth + GRAPH_PADDING * 2,
      height: (maxDepth + 1) * GRAPH_NODE_HEIGHT + maxDepth * GRAPH_VERTICAL_GAP + GRAPH_PADDING * 2
    }
  }
}