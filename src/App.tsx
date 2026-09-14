import { useEffect } from 'react'
import { useCadStore } from './core/store'
import { CanvasViewport } from './ui/CanvasViewport'
import { CommandLine } from './ui/CommandLine'
import { DocsView } from './ui/DocsView'
import { FeatureRequestsView } from './ui/FeatureRequestsView'
import { FileMenu } from './ui/FileMenu'
import { HelpMenu } from './ui/HelpMenu'
import { PreferencesMenu } from './ui/PreferencesMenu'
import { PrintDialog } from './ui/PrintDialog'
import { LayerPanel } from './ui/LayerPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { QuickAccess } from './ui/QuickAccess'
import { SnapPanel } from './ui/SnapPanel'
import { StatusBar } from './ui/StatusBar'
import { SupportView } from './ui/SupportView'
import { ThemeToggle } from './ui/ThemeToggle'
import { Toolbar } from './ui/Toolbar'
import { useGlobalShortcuts } from './ui/useGlobalShortcuts'
import { useRoute } from './ui/useHashRoute'
import { useSidebarWidth } from './ui/useSidebarWidth'

function App() {
  const maybeRecoverAutosave = useCadStore((state) => state.maybeRecoverAutosave)
  const { width: sidebarWidth, startResize } = useSidebarWidth()
  const route = useRoute()
  // The drawing keys belong to the drawing: on a reader page they stand down.
  useGlobalShortcuts(route.kind === 'cad')

  useEffect(() => {
    maybeRecoverAutosave()
  }, [maybeRecoverAutosave])

  /*
   * Documentation, requests and support are pages, not modals, so they take the
   * whole shell. The drawing stays in the store untouched and is exactly as it
   * was when the reader goes back to it.
   */
  if (route.kind !== 'cad') {
    return (
      <div className="app-shell is-page">
        {route.kind === 'docs' && <DocsView docId={route.docId} />}
        {route.kind === 'requests' && <FeatureRequestsView />}
        {route.kind === 'support' && <SupportView />}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="titlebar">
          <h1 className="wordmark">
            <span className="wordmark-mark">Trim</span>
            <span className="wordmark-suffix">CAD</span>
          </h1>
        <FileMenu />
        <PreferencesMenu />
        <QuickAccess />
        <HelpMenu />
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
      <PrintDialog />
    </div>
  )
}

export default App
