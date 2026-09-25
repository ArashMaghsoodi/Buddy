import { useEffect, useRef, useState } from 'react'
import type { CaptureRequest, MonitorInfo, WindowInfo } from '@shared/types'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'

/**
 * Per-message capture-source picker. A small button in the composer of both
 * the full-window chat and the companion overlay; opens a lightweight
 * popover for choosing what Buddy should look at next. The selection lives
 * in the shared store, so both interfaces stay consistent.
 */
export default function CapturePicker(): JSX.Element {
  const captureSource = useBuddyStore((s) => s.captureSource)
  const setCaptureSource = useBuddyStore((s) => s.setCaptureSource)
  const [open, setOpen] = useState(false)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [windows, setWindows] = useState<WindowInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const label = describeSource(captureSource)

  async function toggleOpen(): Promise<void> {
    const next = !open
    setOpen(next)
    if (next) {
      setWindows(null)
      setError(null)
      try {
        const [mons, wins] = await Promise.all([buddy().captures.listMonitors(), buddy().captures.listWindows()])
        setMonitors(mons)
        setWindows(wins)
      } catch (err) {
        setMonitors([])
        setWindows([])
        setError(err instanceof Error ? err.message : 'Could not enumerate capture sources.')
      }
    }
  }

  function choose(source: CaptureRequest | null): void {
    setCaptureSource(source)
    setOpen(false)
  }

  async function chooseRegion(): Promise<void> {
    setOpen(false)
    try {
      const rect = await buddy().captures.selectRegion()
      if (rect) {
        setCaptureSource({ kind: 'region', region: rect })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Region selection failed.')
    }
  }

  return (
    <div className="capture-picker" ref={rootRef}>
      <button
        type="button"
        className={`composer-btn toggle capture-picker-btn ${captureSource ? 'on' : ''}`}
        title="Choose what Buddy looks at"
        onClick={() => void toggleOpen()}
      >
        {label}
      </button>
      {open && (
        <div className="capture-popover" role="menu">
          <div className="capture-popover-title">Capture</div>
          <button
            className="capture-option"
            role="menuitem"
            onClick={() => choose(null)}
          >
            <span className="capture-option-icon">🖥</span>
            <span>
              Default capture
              <small>Whatever the current capture mode is</small>
            </span>
          </button>
          <button className="capture-option" role="menuitem" onClick={() => choose({ kind: 'monitor', displayId: null })}>
            <span className="capture-option-icon">🖥</span>
            <span>
              Entire monitor
              <small>Your primary display</small>
            </span>
          </button>
          {monitors.length > 1 && (
            <>
              <div className="capture-popover-sep" />
              {monitors.map((m, i) => (
                <button
                  key={m.id}
                  className="capture-option"
                  role="menuitem"
                  onClick={() => choose({ kind: 'monitor', displayId: m.id })}
                >
                  <span className="capture-option-icon">{m.isPrimary ? '🖥' : '🖥'}</span>
                  <span>
                    {m.label}
                    <small>
                      {m.bounds.width}×{m.bounds.height}
                      {m.scaleFactor !== 1 ? ` @ ${Math.round(m.scaleFactor * 100)}%` : ''}
                    </small>
                  </span>
                </button>
              ))}
            </>
          )}
          <div className="capture-popover-sep" />
          <button className="capture-option" role="menuitem" onClick={() => choose({ kind: 'window', windowId: null })}>
            <span className="capture-option-icon">🪟</span>
            <span>
              Current window
              <small>Whatever you have focused right now</small>
            </span>
          </button>
          <div className="capture-popover-sep" />
          {windows === null ? (
            <div className="capture-option capture-option-loading">Loading windows…</div>
          ) : (
            windows.map((w) => (
              <button key={w.id} className="capture-option" role="menuitem" onClick={() => choose({ kind: 'window', windowId: w.id })}>
                <span className="capture-option-icon">▸</span>
                <span>
                  {w.title || 'Untitled window'}
                  <small>Window</small>
                </span>
              </button>
            ))
          )}
          <div className="capture-popover-sep" />
          <button className="capture-option" role="menuitem" onClick={() => void chooseRegion()}>
            <span className="capture-option-icon">⬚</span>
            <span>
              Select region…
              <small>Drag a rectangle on screen</small>
            </span>
          </button>
          {error && <div className="capture-error">{error}</div>}
        </div>
      )}
    </div>
  )
}

function describeSource(source: CaptureRequest | null): string {
  if (!source) return 'Capture'
  switch (source.kind) {
    case 'monitor':
      return 'Monitor'
    case 'window':
      return source.windowId ? 'Window' : 'Current window'
    case 'region':
      return `Region ${source.region.width}×${source.region.height}`
    default:
      return 'Capture'
  }
}
