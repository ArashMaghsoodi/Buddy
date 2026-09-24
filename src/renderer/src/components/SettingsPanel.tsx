import { useState } from 'react'
import type { AppSettings, ModelInfo, ProviderConfig, ProviderId } from '@shared/types'
import { useBuddyStore } from '../state/store'
import { buddy } from '../lib/ipc'
import HotkeyRecorder from './HotkeyRecorder'
import ModelPicker from './ModelPicker'

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  )
}

export default function SettingsPanel(): JSX.Element | null {
  const settings = useBuddyStore((s) => s.settings)
  const saveSettings = useBuddyStore((s) => s.saveSettings)
  const [local, setLocal] = useState<AppSettings | null>(settings)
  const [modelOptions, setModelOptions] = useState<Partial<Record<ProviderId, ModelInfo[]>>>({})
  const [fetchingProvider, setFetchingProvider] = useState<ProviderId | null>(null)
  const [fetchErrors, setFetchErrors] = useState<Partial<Record<ProviderId, string>>>({})

  if (!local) return null

  function update(next: AppSettings): void {
    setLocal(next)
    saveSettings(next)
  }

  function updateActiveProvider(patch: Partial<ProviderConfig>): void {
    const current = local!.ai.providers[local!.ai.activeProvider]
    update({
      ...local!,
      ai: {
        ...local!.ai,
        providers: {
          ...local!.ai.providers,
          [current.id]: { ...current, ...patch }
        }
      }
    })
  }

  async function handleFetchModels(provider: ProviderConfig): Promise<void> {
    setFetchingProvider(provider.id)
    setFetchErrors((prev) => ({ ...prev, [provider.id]: undefined }))
    try {
      const models = await buddy().ai.fetchModels(provider.id, provider)
      setModelOptions((prev) => ({ ...prev, [provider.id]: models }))
    } catch (err) {
      setFetchErrors((prev) => ({
        ...prev,
        [provider.id]: err instanceof Error ? err.message : 'Could not fetch models.'
      }))
    } finally {
      setFetchingProvider(null)
    }
  }

  const activeProvider = local.ai.providers[local.ai.activeProvider]

  return (
    <div className="settings-wrap">
      <h1>Settings</h1>
      <div className="subtitle">Buddy runs locally. Nothing is captured or sent anywhere without your say-so.</div>

      <div className="settings-section">
        <h2>General</h2>
        <div className="settings-row">
          <div>
            <div className="label">Launch on startup</div>
          </div>
          <Switch
            checked={local.general.launchOnStartup}
            onChange={(v) => update({ ...local, general: { ...local.general, launchOnStartup: v } })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Open companion hotkey</div>
            <div className="desc">Global shortcut, works even when Buddy isn't focused</div>
          </div>
          <HotkeyRecorder
            value={local.general.hotkeyOpenCompanion}
            onChange={(next) =>
              update({ ...local, general: { ...local.general, hotkeyOpenCompanion: next } })
            }
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Analyze screen hotkey</div>
            <div className="desc">Captures the screen and opens the companion</div>
          </div>
          <HotkeyRecorder
            value={local.general.hotkeyAnalyzeScreen}
            onChange={(next) =>
              update({ ...local, general: { ...local.general, hotkeyAnalyzeScreen: next } })
            }
          />
        </div>
        <div className="settings-row">
          <div className="label">Notifications</div>
          <Switch
            checked={local.general.notificationsEnabled}
            onChange={(v) => update({ ...local, general: { ...local.general, notificationsEnabled: v } })}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>Screen</h2>
        <div className="settings-row">
          <div className="label">Capture mode</div>
          <select
            value={local.screen.captureMode}
            onChange={(e) =>
              update({
                ...local,
                screen: { ...local.screen, captureMode: e.target.value as AppSettings['screen']['captureMode'] }
              })
            }
          >
            <option value="fullScreen">Entire display</option>
            <option value="activeWindow">Active window</option>
            <option value="region">Selected region (beta)</option>
          </select>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Visual context retention</div>
            <div className="desc">How many recent screenshots stay available for follow-ups</div>
          </div>
          <input
            type="number"
            min={1}
            max={10}
            value={local.screen.visualContextRetention}
            onChange={(e) =>
              update({
                ...local,
                screen: { ...local.screen, visualContextRetention: Number(e.target.value) || 1 }
              })
            }
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Proactive mode</div>
            <div className="desc">Let Buddy occasionally offer help, unprompted (off by default)</div>
          </div>
          <Switch
            checked={local.screen.proactiveModeEnabled}
            onChange={(v) => update({ ...local, screen: { ...local.screen, proactiveModeEnabled: v } })}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>AI Provider</h2>
        <div className="settings-row">
          <div className="label">Active provider</div>
          <select
            value={local.ai.activeProvider}
            onChange={(e) =>
              update({ ...local, ai: { ...local.ai, activeProvider: e.target.value as ProviderId } })
            }
          >
            {Object.values(local.ai.providers)
              .filter((p) => (p.id as string) !== 'custom-openai-compatible')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
        </div>
        {(activeProvider.id === 'custom' || activeProvider.id === '9router') && (
          <div className="settings-row">
            <div>
              <div className="label">Base URL</div>
              <div className="desc">
                {activeProvider.id === '9router'
                  ? '9Router endpoint; models and dashboard combos appear together'
                  : 'The endpoint for your custom OpenAI-compatible provider'}
              </div>
            </div>
            <input
              type="text"
              value={activeProvider.baseUrl ?? ''}
              onChange={(e) => updateActiveProvider({ baseUrl: e.target.value })}
            />
          </div>
        )}
        <div className="settings-row">
          <div className="label">API key</div>
          <input
            type="password"
            placeholder={activeProvider.id === 'custom' || activeProvider.id === '9router' ? 'optional' : 'sk-…'}
            value={activeProvider.apiKey ?? ''}
            onChange={(e) => updateActiveProvider({ apiKey: e.target.value })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Model</div>
            <div className="desc">👀 vision · 🧠 reasoning · 🔨 tool use</div>
          </div>
          <ModelPicker
            value={activeProvider.model}
            options={modelOptions[activeProvider.id] ?? null}
            loading={fetchingProvider === activeProvider.id}
            error={fetchErrors[activeProvider.id] ?? null}
            onChange={(next) => updateActiveProvider({ model: next })}
            onFetch={() => handleFetchModels(activeProvider)}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>Privacy</h2>
        <div className="settings-row">
          <div>
            <div className="label">Cloud processing allowed</div>
            <div className="desc">Disable to restrict Buddy to local/offline providers only</div>
          </div>
          <Switch
            checked={local.privacy.cloudProcessingAllowed}
            onChange={(v) => update({ ...local, privacy: { ...local.privacy, cloudProcessingAllowed: v } })}
          />
        </div>
        <div className="settings-row">
          <div className="label">Screenshot retention</div>
          <select
            value={local.privacy.screenshotRetention}
            onChange={(e) =>
              update({
                ...local,
                privacy: {
                  ...local.privacy,
                  screenshotRetention: e.target.value as AppSettings['privacy']['screenshotRetention']
                }
              })
            }
          >
            <option value="none">Never keep screenshots</option>
            <option value="session">Keep for this session only</option>
            <option value="persist">Keep with conversation history</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="label">Conversation retention</div>
          <select
            value={local.privacy.conversationRetentionDays ?? 'forever'}
            onChange={(e) =>
              update({
                ...local,
                privacy: {
                  ...local.privacy,
                  conversationRetentionDays: e.target.value === 'forever' ? null : Number(e.target.value)
                }
              })
            }
          >
            <option value="forever">Keep forever</option>
            <option value="30">30 days</option>
            <option value="7">7 days</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h2>Appearance</h2>
        <div className="settings-row">
          <div className="label">Companion always on top</div>
          <Switch
            checked={local.appearance.companionAlwaysOnTop}
            onChange={(v) =>
              update({ ...local, appearance: { ...local.appearance, companionAlwaysOnTop: v } })
            }
          />
        </div>
        <div className="settings-row">
          <div className="label">Overlay opacity</div>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={local.appearance.overlayOpacity}
            onChange={(e) =>
              update({
                ...local,
                appearance: { ...local.appearance, overlayOpacity: Number(e.target.value) }
              })
            }
          />
        </div>
        <div className="settings-row">
          <div className="label">Animation intensity</div>
          <select
            value={local.appearance.animationIntensity}
            onChange={(e) =>
              update({
                ...local,
                appearance: {
                  ...local.appearance,
                  animationIntensity: e.target.value as AppSettings['appearance']['animationIntensity']
                }
              })
            }
          >
            <option value="none">None</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="label">Density</div>
          <select
            value={local.appearance.density}
            onChange={(e) =>
              update({
                ...local,
                appearance: { ...local.appearance, density: e.target.value as AppSettings['appearance']['density'] }
              })
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
      </div>
    </div>
  )
}
