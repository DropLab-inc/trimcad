import { useEffect } from 'react'
import { useCadStore } from './core/store'
import { CanvasViewport } from './ui/CanvasViewport'
import { CommandLine } from './ui/CommandLine'
import { LayerPanel } from './ui/LayerPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { SnapPanel } from './ui/SnapPanel'
import { StatusBar } from './ui/StatusBar'
import { Toolbar } from './ui/Toolbar'

function App() {
  const maybeRecoverAutosave = useCadStore((state) => state.maybeRecoverAutosave)

  useEffect(() => {
    maybeRecoverAutosave()
  }, [maybeRecoverAutosave])

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>DropLabCad</h1>
        <Toolbar />
      </header>

      <main className="workspace">
        <CanvasViewport />
        <aside className="rightbar">
          <LayerPanel />
          <SnapPanel />
          <PropertiesPanel />
        </aside>
      </main>

      <CommandLine />
      <StatusBar />
    </div>
  )
}

export default App
