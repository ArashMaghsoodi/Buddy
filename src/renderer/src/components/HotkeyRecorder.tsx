import { useEffect, useRef, useState } from 'react'

const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super']

function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta'
}

function normalizeModifier(key: string): string {
  // Electron's accelerator format calls the Windows/Command key "Super".
  return key === 'Meta' ? 'Super' : key
}

const SPECIAL_KEY_NAMES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space'
}

function normalizeMainKey(key: string): string {
  if (SPECIAL_KEY_NAMES[key]) return SPECIAL_KEY_NAMES[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

interface Props {
  value: string
  onChange: (next: string) => void
}

/**
 * A hotkey field that becomes a live recorder when clicked:
 *  - click -> placeholder "hit your hotkeys, Esc for cancel", a ✓ appears
 *  - held modifiers are shown immediately (e.g. "Alt") but don't save
 *  - pressing a non-modifier key while modifiers are held completes the
 *    combo (e.g. "Alt+W"); releasing a modifier before pressing a key
 *    means that modifier is not part of the combo
 *  - Esc cancels and restores the previous value; ✓ commits the live combo
 */
export default function HotkeyRecorder({ value, onChange }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [live, setLive] = useState('')
  const heldModifiers = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!editing) return

    function currentCombo(mainKey?: string): string {
      const mods = MODIFIER_ORDER.filter((m) => heldModifiers.current.has(m))
      return mainKey ? [...mods, mainKey].join('+') : mods.join('+')
    }

    function onKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        cancel()
        return
      }

      if (isModifierKey(e.key)) {
        heldModifiers.current.add(normalizeModifier(e.key))
        setLive(currentCombo())
        return
      }

      setLive(currentCombo(normalizeMainKey(e.key)))
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (isModifierKey(e.key)) {
        heldModifiers.current.delete(normalizeModifier(e.key))
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [editing])

  function startEditing(): void {
    heldModifiers.current.clear()
    setLive('')
    setEditing(true)
  }

  function cancel(): void {
    heldModifiers.current.clear()
    setLive('')
    setEditing(false)
  }

  function confirm(): void {
    const parts = live.split('+').filter(Boolean)
    const hasMainKey = parts.length > 0 && !MODIFIER_ORDER.includes(parts[parts.length - 1])
    if (hasMainKey) {
      onChange(live)
    }
    cancel()
  }

  return (
    <div className="hotkey-recorder">
      <input
        type="text"
        readOnly
        className={editing ? 'recording' : ''}
        value={editing ? live || 'hit your hotkeys, Esc for cancel' : value}
        onClick={() => !editing && startEditing()}
      />
      {editing && (
        <button className="hotkey-confirm" title="Confirm hotkey" onClick={confirm}>
          ✓
        </button>
      )}
    </div>
  )
}
