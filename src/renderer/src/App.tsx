import { useEffect, useState } from 'react'
import { useBuddyStore } from './state/store'
import { buddy } from './lib/ipc'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import TitleBar from './components/TitleBar'

export default function App(): JSX.Element {
  const loadInitial = useBuddyStore((s) => s.loadInitial)
  const loading = useBuddyStore((s) => s.loading)
  const selectConversation = useBuddyStore((s) => s.selectConversation)
  const [view, setView] = useState<'chat' | 'settings'>('chat')

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // Handoff from the compact overlay's "open in new window": a pending id
  // covers the case where this window was just created and is still
  // loading when the request came in; the live listener covers the case
  // where the main window is already open and just needs to switch to it.
  useEffect(() => {
    buddy()
      .mainWindow.consumePendingConversation()
      .then((id) => {
        if (id) {
          selectConversation(id)
          setView('chat')
        }
      })
      .catch(() => {})

    const off = buddy().mainWindow.onOpenConversation((id) => {
      selectConversation(id)
      setView('chat')
    })
    return off
  }, [selectConversation])

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
