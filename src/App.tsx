import { useEffect } from 'react'
import { useCadStore } from './core/store'
import { CanvasViewport } from './ui/CanvasViewport'
import { CommandLine } from './ui/CommandLine'
import { FileMenu } from './ui/FileMenu'
import { LayerPanel } from './ui/LayerPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { QuickAccess } from './ui/QuickAccess'
import { SnapPanel } from './ui/SnapPanel'
import { StatusBar } from './ui/StatusBar'
import { ThemeToggle } from './ui/ThemeToggle'
import { Toolbar } from './ui/Toolbar'
import { useGlobalShortcuts } from './ui/useGlobalShortcuts'
import { useSidebarWidth } from './ui/useSidebarWidth'

function App() {
  const maybeRecoverAutosave = useCadStore((state) => state.maybeRecoverAutosave)
  const { width: sidebarWidth, startResize } = useSidebarWidth()
  useGlobalShortcuts()

  useEffect(() => {
    maybeRecoverAutosave()
  }, [maybeRecoverAutosave])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="titlebar">
          <h1 className="wordmark">
            <span className="wordmark-logo" role="img" aria-label="DropLab" />
            <span className="wordmark-suffix">Cad</span>
          </h1>
          <FileMenu />
          <QuickAccess />
          <ThemeToggle />
        </div>
        <Toolbar />
      </header>

      <main className="workspace" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${sidebarWidth}px` }}>
        <CanvasViewport />
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the side panels"
          onPointerDown={startResize}
        />
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
