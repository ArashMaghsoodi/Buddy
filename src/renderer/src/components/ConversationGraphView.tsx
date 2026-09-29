import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, Maximize, Minus, Plus, Trash2, X } from 'lucide-react'
import { layoutConversationGraph, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, GRAPH_PADDING } from '@shared/conversationGraph'
import type { Conversation } from '@shared/types'

interface ConversationGraphViewProps {
  conversation: Conversation
  activeIds: Set<string>
  onSelect: (messageId: string) => void
  onBranch: (messageId: string) => void
  onDelete: (messageId: string) => void
}

export default function ConversationGraphView({
  conversation,
  activeIds,
  onSelect,
  onBranch,
  onDelete
}: ConversationGraphViewProps): JSX.Element {
  const layout = useMemo(() => layoutConversationGraph(conversation), [conversation])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [detailHeight, setDetailHeight] = useState(160)
  const viewportRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const nodesById = new Map(layout.nodes.map((node) => [node.message.id, node]))
  const selectedMessage = conversation.messages.find((message) => message.id === selectedMessageId)
  const selectedNode = selectedMessageId ? nodesById.get(selectedMessageId) : undefined
  const detailWidth = Math.min(320, Math.max(240, layout.bounds.width - 24))
  const detailLeft = selectedNode
    ? Math.min(Math.max(12, selectedNode.x), layout.bounds.width - detailWidth - 12)
    : 0
  const detailTop = selectedNode
    ? selectedNode.y - detailHeight - 8 >= GRAPH_PADDING
      ? selectedNode.y - detailHeight - 8
      : selectedNode.y + GRAPH_NODE_HEIGHT + 8
    : 0
  const worldHeight = Math.max(
    layout.bounds.height,
    selectedNode ? detailTop + detailHeight + GRAPH_PADDING : 0
  )

  useLayoutEffect(() => {
    const element = detailRef.current
    if (!element) return

    const updateHeight = () => setDetailHeight(element.offsetHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [selectedMessageId, selectedMessage?.content])

  function fitToView(): void {
    const viewport = viewportRef.current
    if (!viewport || layout.bounds.width === 0 || layout.bounds.height === 0) return
    const availableWidth = Math.max(1, viewport.clientWidth - 48)
    const availableHeight = Math.max(1, viewport.clientHeight - 48)
    const scale = Math.max(0.35, Math.min(1, availableWidth / layout.bounds.width, availableHeight / layout.bounds.height))
    setView({
      x: Math.max(24, (viewport.clientWidth - layout.bounds.width * scale) / 2),
      y: Math.max(24, (viewport.clientHeight - layout.bounds.height * scale) / 2),
      scale
    })
  }

  useEffect(() => {
    fitToView()
  }, [layout.bounds.width, layout.bounds.height])

  function zoomAt(nextScale: number, clientX?: number, clientY?: number): void {
    const viewport = viewportRef.current
    if (!viewport) return
    const scale = Math.min(2.4, Math.max(0.35, nextScale))
    const bounds = viewport.getBoundingClientRect()
    const pointerX = clientX === undefined ? viewport.clientWidth / 2 : clientX - bounds.left
    const pointerY = clientY === undefined ? viewport.clientHeight / 2 : clientY - bounds.top
    const graphX = (pointerX - view.x) / view.scale
    const graphY = (pointerY - view.y) / view.scale
    setView({ x: pointerX - graphX * scale, y: pointerY - graphY * scale, scale })
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('button')) return
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPanning(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setView((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    }))
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return
    panRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    zoomAt(view.scale * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY)
  }

  return (
    <div id="tree-graph-panel" className="conversation-graph" role="tabpanel" aria-labelledby="tree-graph-tab" tabIndex={0}>
      <div
        ref={viewportRef}
        className={`conversation-graph-viewport ${isPanning ? 'panning' : ''}`}
        role="region"
        aria-label="Conversation graph. Drag to pan; hold Control or Command while scrolling to zoom."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="conversation-graph-controls" aria-label="Graph zoom controls">
          <button
            type="button"
            data-tooltip="Zoom out"
            data-tooltip-placement="below-start"
            aria-label="Zoom out"
            onClick={() => zoomAt(view.scale / 1.2)}
          >
            <Minus size={15} />
          </button>
          <span aria-live="polite">{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            data-tooltip="Zoom in"
            data-tooltip-placement="below-end"
            aria-label="Zoom in"
            onClick={() => zoomAt(view.scale * 1.2)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            data-tooltip="Fit graph to view"
            data-tooltip-placement="below-end"
            aria-label="Fit graph to view"
            onClick={fitToView}
          >
            <Maximize size={14} />
          </button>
        </div>
        <div
          className="conversation-graph-world"
          style={{
            width: layout.bounds.width,
            height: worldHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
          }}
        >
          <svg
            className="conversation-graph-svg"
            width={layout.bounds.width}
            height={layout.bounds.height}
            aria-hidden="true"
          >
            <g className="conversation-graph-edges">
              {layout.edges.map((edge) => {
                const parent = nodesById.get(edge.from)
                const child = nodesById.get(edge.to)
                if (!parent || !child) return null
                const startX = parent.x + GRAPH_NODE_WIDTH / 2
                const startY = parent.y + GRAPH_NODE_HEIGHT
                const endX = child.x + GRAPH_NODE_WIDTH / 2
                const endY = child.y
                const controlY = startY + (endY - startY) / 2

                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`}
                  />
                )
              })}
            </g>
          </svg>

          {layout.nodes.map((node) => {
            const isUser = node.message.role === 'user'
            const roleLabel = isUser ? 'User' : node.message.role === 'assistant' ? 'Assistant' : 'System'
            const preview = node.message.content.replace(/\s+/g, ' ').trim() || '(empty message)'
            const selected = selectedMessageId === node.message.id

            return (
              <div
                key={node.message.id}
                className="conversation-graph-node-wrap"
                style={{ left: node.x, top: node.y, width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT }}
              >
                <button
                  type="button"
                  className={`conversation-graph-node ${node.message.role} ${activeIds.has(node.message.id) ? 'active' : ''} ${selected ? 'selected' : ''}`}
                  aria-label={`${roleLabel}: ${preview}`}
                  aria-pressed={selected}
                  aria-expanded={selected}
                  aria-controls={selected ? 'graph-message-details' : undefined}
                  onClick={() => {
                    setSelectedMessageId(node.message.id)
                    onSelect(node.message.id)
                  }}
                >
                  <span className="conversation-graph-role" aria-hidden="true">{roleLabel.slice(0, 1)}</span>
                  <span className="conversation-graph-preview">{preview}</span>
                </button>
                <div className="conversation-graph-node-actions">
                  <button
                    type="button"
                    data-tooltip="Branch from here"
                    data-tooltip-placement="above-end"
                    aria-label={`Branch from ${roleLabel.toLowerCase()} message`}
                    onClick={() => onBranch(node.message.id)}
                  >
                    <GitBranch size={13} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    data-tooltip="Delete this message and its descendants"
                    data-tooltip-placement="above-end"
                    aria-label={`Delete ${roleLabel.toLowerCase()} message and descendants`}
                    onClick={() => onDelete(node.message.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}

          {selectedMessage && selectedNode && (
            <section
              ref={detailRef}
              id="graph-message-details"
              className="conversation-graph-selection"
              aria-label={`${selectedMessage.role} message details`}
              style={{ left: detailLeft, top: detailTop, width: detailWidth }}
            >
              <header>
                <span className={`conversation-graph-selection-role ${selectedMessage.role}`}>
                  {selectedMessage.role}
                </span>
                <button
                  type="button"
                  data-tooltip="Close message details"
                  data-tooltip-placement="above-end"
                  aria-label="Close message details"
                  onClick={() => setSelectedMessageId(null)}
                >
                  <X size={14} />
                </button>
              </header>
              <p>{selectedMessage.content || '(empty message)'}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}