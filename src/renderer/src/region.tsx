import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { buddy } from './lib/ipc'
import type { RegionRect } from '@shared/types'
import './styles/global.css'

/**
 * Fullscreen region-selection overlay. The window is sized and positioned
 * over the union of all displays by the main process, so the browser
 * client coordinates line up 1:1 with virtual-desktop (DIP) coordinates.
 * The user drags a rectangle; on mouse-up we send the rect back to main,
 * which resolves the selection promise and captures the crop.
 */
function RegionOverlay(): JSX.Element {
  const [drag, setDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null)
  const draggingRef = useRef(false)
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [pendingComplete, setPendingComplete] = useState(false)

  const rect = drag
    ? {
        x: Math.min(drag.sx, drag.cx),
        y: Math.min(drag.sy, drag.cy),
        width: Math.abs(drag.cx - drag.sx),
        height: Math.abs(drag.cy - drag.sy)
      }
    : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPendingComplete(true)
        buddy().canvas.cancelRegion()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onPointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return // left only; right-click cancels below
    draggingRef.current = true
    startRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!draggingRef.current) return
    setDrag((d) => (d ? { ...d, cx: e.clientX, cy: e.clientY } : d))
  }

  function onPointerUp(e: React.PointerEvent): void {
    if (!draggingRef.current) return
    draggingRef.current = false
    const r = rect
    if (r && r.width > 2 && r.height > 2) {
      setPendingComplete(true)
      const result: RegionRect = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height)
      }
      buddy().canvas.completeRegion(result)
    } else {
      // A click with no real drag = cancel.
      buddy().canvas.cancelRegion()
    }
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    setPendingComplete(true)
    buddy().canvas.cancelRegion()
  }

  return (
    <div
      className={`region-overlay ${pendingComplete ? 'region-done' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      {rect && <div className="region-select-box" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />}
      {!drag && <div className="region-hint">Drag to select a region · Esc or right-click to cancel</div>}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<RegionOverlay />)
