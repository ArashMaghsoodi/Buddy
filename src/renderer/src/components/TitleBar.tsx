import { useEffect, useState } from 'react'
import { Galaxy } from 'lucide-react'
import type { CompanionState } from '@shared/types'
import { buddy } from '../lib/ipc'
import { useBuddyStore } from '../state/store'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready',
  capturing: 'Capturing screen…',
  analyzing: 'Analyzing…',
  thinking: 'Thinking…',
  responding: 'Responding…',
  error: 'Something went wrong'
}

export default function TitleBar(): JSX.Element {
  const status = useBuddyStore((s) => s.status)
  const label = STATUS_LABEL[status] ?? status
  const [companion, setCompanion] = useState<CompanionState>({ mode: 'fab', visible: false })
  const companionOpen = companion.visible && companion.mode === 'overlay'

  useEffect(() => {
    const off = buddy().companion.onStateChange(setCompanion)
    buddy().companion.getState().then(setCompanion).catch(() => {})
    return off
  }, [])

  async function toggleCompanion(): Promise<void> {
    if (companionOpen) {
      await buddy().companion.collapse()
      setCompanion({ mode: 'fab', visible: true })
    } else {
      await buddy().companion.expand()
      setCompanion({ mode: 'overlay', visible: true })
    }
  }

  return (
    <div className="titlebar">
      <span style={{ fontWeight: 600, color: 'var(--text-0)' }}>Buddy</span>
      <span
        className={`status-dot ${status === 'idle' ? '' : status === 'error' ? 'error' : 'busy'}`}
      />
      <span>{label}</span>
      <button
        type="button"
        className={`titlebar-companion-btn ${companionOpen ? 'active' : ''}`}
        data-tooltip={companionOpen ? 'Collapse companion' : 'Open companion'}
        data-tooltip-placement="below-end"
        aria-label={companionOpen ? 'Collapse companion' : 'Open companion'}
        aria-pressed={companionOpen}
        onClick={() => void toggleCompanion()}
      >
        <Galaxy size={17} />
      </button>
    </div>
  )
}
