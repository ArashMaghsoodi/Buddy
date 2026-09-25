import { useEffect, useRef, useState } from 'react'
import type { ModelInfo } from '@shared/types'
import { Brain, Eye, Hammer } from 'lucide-react'

interface Props {
  value: string
  options: ModelInfo[] | null // null = not fetched yet -> plain text field
  loading: boolean
  error: string | null
  onChange: (next: string) => void
  onFetch: () => void
}

function capabilityLabel(model: ModelInfo): JSX.Element | null {
  const icons = []
  if (model.vision) icons.push(<Eye key="v" size={12} />)
  if (model.reasoning) icons.push(<Brain key="r" size={12} />)
  if (model.tools) icons.push(<Hammer key="t" size={12} />)
  if (!icons.length) return null
  return (
    <span className="model-capability-icons">
      {icons}
    </span>
  )
}

/**
 * Model input. Starts as a plain text field. After the caller successfully
 * fetches a model list (via the "Fetch" button), it becomes a searchable
 * combobox: typing filters the list, clicking an option selects it, and
 * typing something that isn't in the list is still accepted on blur/Enter
 * — the fetched list is a convenience, not a restriction.
 */
export default function ModelPicker({ value, options, loading, error, onChange, onFetch }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (options !== null) setOpen(true)
  }, [options])

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = options?.filter((m) => m.id.toLowerCase().includes(draft.toLowerCase())) ?? []
  const selectedModel = options?.find((model) => model.id === value)

  function commit(v: string): void {
    onChange(v)
    setOpen(false)
  }

  const isDropdown = options !== null

  return (
    <div className="model-picker" ref={wrapRef}>
      <div className="model-picker-input-row">
        <div className="model-picker-field">
          <input
            type="text"
            value={draft}
            placeholder={isDropdown ? 'Search or type a model…' : 'e.g. gpt-4o'}
            onChange={(e) => {
              setDraft(e.target.value)
              if (isDropdown) setOpen(true)
            }}
            onFocus={() => isDropdown && setOpen(true)}
            onBlur={() => {
              if (draft !== value) commit(draft)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit(draft)
                ;(e.target as HTMLInputElement).blur()
              }
              if (e.key === 'Escape') {
                setDraft(value)
                setOpen(false)
              }
            }}
          />
          {selectedModel && (
            <span className="model-capabilities" title="Model capabilities">
              {capabilityLabel(selectedModel)}
            </span>
          )}
        </div>
        <button className="fetch-btn" onClick={onFetch} disabled={loading} title="Fetch available models">
          {loading ? '…' : 'Fetch'}
        </button>
      </div>
      {error && <div className="model-picker-error">{error}</div>}
      {isDropdown && open && filtered.length > 0 && (
        <div className="model-picker-dropdown">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`model-picker-option ${m.id === value ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                setDraft(m.id)
                commit(m.id)
              }}
            >
              <span>{m.id}</span>
              <span className="model-capabilities" title="Model capabilities">
                {capabilityLabel(m)}
              </span>
            </div>
          ))}
        </div>
      )}
      {isDropdown && open && filtered.length === 0 && (
        <div className="model-picker-dropdown">
          <div className="model-picker-empty">No matches — Enter to use "{draft}"</div>
        </div>
      )}
    </div>
  )
}
