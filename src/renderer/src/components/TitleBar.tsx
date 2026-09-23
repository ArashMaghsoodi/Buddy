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

  return (
    <div className="titlebar">
      <span style={{ fontWeight: 600, color: 'var(--text-0)' }}>Buddy</span>
      <span
        className={`status-dot ${status === 'idle' ? '' : status === 'error' ? 'error' : 'busy'}`}
      />
      <span>{label}</span>
    </div>
  )
}
