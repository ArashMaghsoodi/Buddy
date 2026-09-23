import { useEffect, useState } from 'react'
import { useBuddyStore } from './state/store'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import TitleBar from './components/TitleBar'

export default function App(): JSX.Element {
  const loadInitial = useBuddyStore((s) => s.loadInitial)
  const loading = useBuddyStore((s) => s.loading)
  const [view, setView] = useState<'chat' | 'settings'>('chat')

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  if (loading) {
    return (
      <div className="app-shell">
        <TitleBar />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <Sidebar view={view} onChangeView={setView} />
      <div className="main-pane">
        {view === 'chat' ? <ChatView /> : <SettingsPanel />}
      </div>
    </div>
  )
}
