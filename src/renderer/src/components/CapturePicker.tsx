import { useEffect, useRef, useState } from 'react'
import type { CaptureRequest, MonitorInfo, WindowInfo } from '@shared/types'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import { Eye, EyeOff, Monitor, AppWindow, SquareDashed } from 'lucide-react'

/**
 * Unified capture-source picker. A small button in the composer of both the
 * full-window chat and the companion overlay; opens a popover for toggling
 * screen capture and choosing what to look at. The master switch and selected
 * source live in the shared store, so both interfaces stay consistent.
 * "Screen off" always wins regardless of any previously selected source.
 */
export default function CapturePicker(): JSX.Element {
  const captureSource = useBuddyStore((s) => s.captureSource)
  const setCaptureSource = useBuddyStore((s) => s.setCaptureSource)
  const captureEnabled = useBuddyStore((s) => s.captureEnabled)
  const setCaptureEnabled = useBuddyStore((s) => s.setCaptureEnabled)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [windows, setWindows] = useState<WindowInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function closePopover(): void {
    setOpen(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setMounted(false)
      closeTimerRef.current = null
    }, 140)
  }

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) closePopover()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  const label = captureEnabled ? describeSource(captureSource) : 'Capture off'

  async function openPopover(): Promise<void> {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setMounted(true)
    setOpen(true)
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

  function choose(source: CaptureRequest): void {
    // Selecting a source also enables capture so the toggle and source are
    // always in sync: the user picks a target → capture goes on.
    setCaptureEnabled(true)
    setCaptureSource(source)
  }

  async function chooseRegion(): Promise<void> {
    try {
      const rect = await buddy().captures.selectRegion()
      if (rect) {
        setCaptureEnabled(true)
        setCaptureSource({ kind: 'region', region: rect })
        closePopover()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Region selection failed.')
    }
  }

  return (
    <div className="capture-picker" ref={rootRef}>
      <button
        type="button"
        className={`composer-btn toggle capture-picker-btn ${captureEnabled ? 'on' : ''}`}
        title={label}
        onClick={() => {
          if (open) closePopover()
          else void openPopover()
        }}
      >
        {captureEnabled ? <Eye size={14} /> : <EyeOff size={14} />} {label}
      </button>
      {mounted && (
        <div className={`capture-popover ${open ? 'open' : 'closing'}`} role="menu" aria-hidden={!open}>
          <div className="capture-popover-header">
            <span className="capture-popover-title">Capture</span>
            <label className="switch capture-switch">
              <input
                type="checkbox"
                checked={captureEnabled}
                onChange={(e) => setCaptureEnabled(e.target.checked)}
              />
              <span className="track">
                <span className="thumb" />
              </span>
            </label>
          </div>

          {monitors.length > 1 &&
            monitors.map((m) => (
              <button
                key={m.id}
                className={`capture-option${captureSource?.kind === 'monitor' && captureSource.displayId === m.id ? ' selected' : ''}`}
                role="menuitemradio"
                aria-checked={captureSource?.kind === 'monitor' && captureSource.displayId === m.id}
                onClick={() => choose({ kind: 'monitor', displayId: m.id })}
              >
                <span className="capture-option-icon"><Monitor size={16} /></span>
                <span>
                  {m.label}
                  <small>
                    {m.bounds.width}×{m.bounds.height}
                    {m.scaleFactor !== 1 ? ` @ ${Math.round(m.scaleFactor * 100)}%` : ''}
                  </small>
                </span>
              </button>
            ))}
          <div className="capture-popover-sep" />
          <button
            className={`capture-option${captureSource?.kind === 'window' && captureSource.windowId === null ? ' selected' : ''}`}
            role="menuitemradio"
            aria-checked={captureSource?.kind === 'window' && captureSource.windowId === null}
            onClick={() => choose({ kind: 'window', windowId: null })}
          >
            <span className="capture-option-icon"><AppWindow size={16} /></span>
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
              <button
                key={w.id}
                className={`capture-option${captureSource?.kind === 'window' && captureSource.windowId === w.id ? ' selected' : ''}`}
                role="menuitemradio"
                aria-checked={captureSource?.kind === 'window' && captureSource.windowId === w.id}
                onClick={() => choose({ kind: 'window', windowId: w.id })}
              >
                <span className="capture-option-icon">
                  {w.iconDataUrl ? <img className="capture-win-icon" src={w.iconDataUrl} alt="" /> : <AppWindow size={16} />}
                </span>
                <span>
                  {w.title || 'Untitled window'}
                  <small>Window</small>
                </span>
              </button>
            ))
          )}
          <div className="capture-popover-sep" />
          <button
            className={`capture-option${captureSource?.kind === 'region' ? ' selected' : ''}`}
            role="menuitemradio"
            aria-checked={captureSource?.kind === 'region'}
            onClick={() => void chooseRegion()}
          >
            <span className="capture-option-icon"><SquareDashed size={16} /></span>
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
  if (!source) return 'Default'
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