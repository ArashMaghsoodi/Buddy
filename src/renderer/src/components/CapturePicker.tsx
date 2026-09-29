import { useEffect, useRef, useState } from 'react'
import type { AppSettings, CaptureRequest, MonitorInfo, WindowInfo } from '@shared/types'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import { Eye, EyeOff, Monitor, AppWindow, SquareDashed, Pin, PinOff, Trash2, Info } from 'lucide-react'

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
  const settings = useBuddyStore((s) => s.settings)
  const saveSettings = useBuddyStore((s) => s.saveSettings)
  const [windows, setWindows] = useState<WindowInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contextTargetId, setContextTargetId] = useState<string | null>(null)
  const [detailsTargetId, setDetailsTargetId] = useState<string | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
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
      if (e.button === 2) return
      if (!rootRef.current?.contains(e.target as Node)) {
        closePopover()
        setContextTargetId(null)
        setDetailsTargetId(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function closeContextMenu(): void {
    setContextTargetId(null)
    setDetailsTargetId(null)
    setContextMenuPosition(null)
  }

  function openContextMenuForWindow(event: React.MouseEvent<HTMLElement>, windowId: string): void {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 180
    const menuHeight = 170
    const padding = 8
    const row = event.currentTarget as HTMLElement
    const rowRect = row.getBoundingClientRect()
    const parentRect = row.parentElement?.getBoundingClientRect()

    if (!parentRect) {
      setContextMenuPosition({ x: padding, y: padding })
      setContextTargetId(windowId)
      setDetailsTargetId(null)
      return
    }

    const x = Math.min(
      Math.max(rowRect.right - parentRect.left + padding, padding),
      Math.max(padding, parentRect.width - menuWidth - padding)
    )
    const y = Math.min(
      Math.max(rowRect.top - parentRect.top + padding, padding),
      Math.max(padding, parentRect.height - menuHeight - padding)
    )

    setContextMenuPosition({ x, y })
    setContextTargetId(windowId)
    setDetailsTargetId(null)
  }

  useEffect(() => {
    if (contextTargetId === null) return
    function onDocClick(e: MouseEvent): void {
      if (e.button === 2) return
      const target = e.target as Node
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        closeContextMenu()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [contextTargetId])

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  const label = captureEnabled ? describeSource(captureSource) : 'Capture off'
  const pins = settings?.screen.captureTargetPins ?? []
  const blacklist = settings?.screen.captureTargetBlacklist ?? []

  function isPinned(windowId: string): boolean {
    return pins.some((item) => item.id === windowId)
  }

  function isBlacklisted(windowId: string): boolean {
    return blacklist.some((item) => item.id === windowId)
  }

  function applyTargetPreference(next: AppSettings['screen']): void {
    if (!settings) return
    void saveSettings({ ...settings, screen: next })
  }

  function togglePin(windowId: string, title: string): void {
    const nextPins = isPinned(windowId)
      ? pins.filter((item) => item.id !== windowId)
      : [...pins, { id: windowId, title }]
    applyTargetPreference({ ...settings!.screen, captureTargetPins: nextPins })
  }

  function toggleBlacklist(windowId: string, title: string): void {
    const nextBlacklist = isBlacklisted(windowId)
      ? blacklist.filter((item) => item.id !== windowId)
      : [...blacklist, { id: windowId, title }]
    applyTargetPreference({ ...settings!.screen, captureTargetBlacklist: nextBlacklist })
  }

  function sortedWindows(list: WindowInfo[]): WindowInfo[] {
    const visible = list.filter((win) => !blacklist.some((item) => item.id === win.id))
    return [...visible].sort((a, b) => {
      const aPinned = isPinned(a.id) ? 1 : 0
      const bPinned = isPinned(b.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return (a.title || 'Untitled window').localeCompare(b.title || 'Untitled window')
    })
  }

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

  async function setCaptureToggle(enabled: boolean): Promise<void> {
    if (!enabled) {
      setCaptureEnabled(false)
      return
    }

    if (!captureSource) {
      try {
        const availableMonitors = monitors.length > 0 ? monitors : await buddy().captures.listMonitors()
        setMonitors(availableMonitors)
        const primaryMonitor = availableMonitors.find((monitor) => monitor.isPrimary) ?? availableMonitors[0]
        setCaptureSource({ kind: 'monitor', displayId: primaryMonitor?.id ?? null })
      } catch {
        setCaptureSource({ kind: 'monitor', displayId: null })
      }
    }

    setCaptureEnabled(true)
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
        data-tooltip={label}
        data-tooltip-placement="above-end"
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
                onChange={(e) => void setCaptureToggle(e.target.checked)}
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
            sortedWindows(windows).map((w) => (
              <div
                key={w.id}
                className="capture-window-row"
                onContextMenu={(e) => openContextMenuForWindow(e, w.id)}
              >
                <button
                  className={`capture-option${captureSource?.kind === 'window' && captureSource.windowId === w.id ? ' selected' : ''}`}
                  role="menuitemradio"
                  aria-checked={captureSource?.kind === 'window' && captureSource.windowId === w.id}
                  onClick={() => choose({ kind: 'window', windowId: w.id })}
                  onContextMenu={(e) => openContextMenuForWindow(e, w.id)}
                >
                  <span className="capture-option-icon">
                    {w.iconDataUrl ? (
                      <>
                        <img className="capture-win-icon" src={w.iconDataUrl} alt="" />
                        {isPinned(w.id) && <span className="capture-pin-badge" aria-label="Pinned target"><Pin size={9} /></span>}
                      </>
                    ) : (
                      <>
                        <AppWindow size={16} />
                        {isPinned(w.id) && <span className="capture-pin-badge" aria-label="Pinned target"><Pin size={9} /></span>}
                      </>
                    )}
                  </span>
                  <span>
                    {w.title || 'Untitled window'}
                    <small>Window</small>
                  </span>
                </button>

                {contextTargetId === w.id && contextMenuPosition && (
                  <div
                    ref={contextMenuRef}
                    className="capture-target-context"
                    role="menu"
                    style={{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }}
                  >
                    {detailsTargetId === w.id ? (
                      <>
                        <div className="capture-target-detail-head">
                          <span>{w.title || 'Untitled window'}</span>
                          <button type="button" className="capture-target-back" onClick={() => setDetailsTargetId(null)}>Back</button>
                        </div>
                        <div className="capture-target-detail-row"><span>Type</span><strong>Window</strong></div>
                        <div className="capture-target-detail-row"><span>Pinned</span><strong>{isPinned(w.id) ? 'Yes' : 'No'}</strong></div>
                        <div className="capture-target-detail-row"><span>Blocked</span><strong>{isBlacklisted(w.id) ? 'Yes' : 'No'}</strong></div>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { togglePin(w.id, w.title || 'Untitled window'); closeContextMenu() }}>
                          {isPinned(w.id) ? <PinOff size={13} /> : <Pin size={13} />} {isPinned(w.id) ? 'Unpin' : 'Pin'}
                        </button>
                        <button type="button" onClick={() => { toggleBlacklist(w.id, w.title || 'Untitled window'); closeContextMenu() }}>
                          <Trash2 size={13} /> Remove from list
                        </button>
                        <button type="button" onClick={() => setDetailsTargetId(w.id)}>
                          <Info size={13} /> More info
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
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
  if (!source) return 'Primary monitor'
  switch (source.kind) {
    case 'monitor':
      return source.displayId ? 'Monitor' : 'Primary monitor'
    case 'window':
      return source.windowId ? 'Window' : 'Current window'
    case 'region':
      return `Region ${source.region.width}×${source.region.height}`
    default:
      return 'Capture'
  }
}