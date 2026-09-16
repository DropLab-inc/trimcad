import { useEffect, useState } from 'react'
import { useCadStore } from './core/store'
import { CanvasViewport } from './ui/CanvasViewport'
import { CommandLine } from './ui/CommandLine'
import { DocsView } from './ui/DocsView'
import { FeatureRequestsView } from './ui/FeatureRequestsView'
import { FileMenu } from './ui/FileMenu'
import { HelpMenu } from './ui/HelpMenu'
import { Icon } from './ui/Icon'
import { PreferencesMenu } from './ui/PreferencesMenu'
import { MTextEditor } from './ui/MTextEditor'
import { PrintDialog } from './ui/PrintDialog'
import { TextStylesDialog } from './ui/TextStylesDialog'
import { LayerPanel } from './ui/LayerPanel'
import { BlocksPanel } from './ui/BlocksPanel'
import { LayoutTabs } from './ui/LayoutTabs'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { QuickAccess } from './ui/QuickAccess'
import { SnapPanel } from './ui/SnapPanel'
import { StatusBar } from './ui/StatusBar'
import { RequestsCta, SupportCta } from './ui/SupportCtas'
import { SupportView } from './ui/SupportView'
import { ThemeToggle } from './ui/ThemeToggle'
import { Toolbar } from './ui/Toolbar'
import { useGlobalShortcuts } from './ui/useGlobalShortcuts'
import { useKeyboardInset } from './ui/useKeyboardInset'
import { useRoute } from './ui/useHashRoute'
import { NARROW_QUERY, useMediaQuery } from './ui/useMediaQuery'
import { useSidebarWidth } from './ui/useSidebarWidth'

function App() {
  const maybeRecoverAutosave = useCadStore((state) => state.maybeRecoverAutosave)
  const { width: sidebarWidth, startResize } = useSidebarWidth()
  const route = useRoute()
  const narrow = useMediaQuery(NARROW_QUERY)
  // Keeps the command bar clear of the on-screen keyboard where the browser
  // overlays it rather than resizing the window (iOS).
  useKeyboardInset(narrow)
  /*
   * On a phone the layer and snap panels are a drawer rather than a column, and
   * the drawing gets the whole width. The drawer remembers which page it was
   * opened on, so walking to the manual and back never leaves it hanging open.
   */
  const routeKey = route.kind === 'docs' ? `docs:${route.docId}` : route.kind
  const [drawerOn, setDrawerOn] = useState<string | null>(null)
  const panelsOpen = narrow && drawerOn === routeKey

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
    <div className={`app-shell ${narrow ? 'is-narrow' : ''}`}>
      <header className="topbar">
        <div className="titlebar">
          <h1 className="brand">
            <img className="brand-mark" src="/trimcad-logo-256.png" alt="TrimCAD" width={32} height={32} />
          </h1>
        <FileMenu />
        <PreferencesMenu />
        <RequestsCta />
        <SupportCta />
        <QuickAccess />
        <HelpMenu />
          <ThemeToggle />
          {narrow && (
            <button
              type="button"
              className={`panels-toggle ${panelsOpen ? 'active' : ''}`}
              aria-expanded={panelsOpen}
              aria-controls="drawing-panels"
              aria-label={panelsOpen ? 'Hide the panels' : 'Show the layers, snaps and properties panels'}
              title="Layers, snaps and properties"
              onClick={() => setDrawerOn(panelsOpen ? null : routeKey)}
            >
              <Icon name="panels" />
              <span className="panels-toggle-label">Panels</span>
            </button>
          )}
        </div>
        <Toolbar />
      </header>

      <main
        className="workspace"
        style={narrow ? undefined : { gridTemplateColumns: `minmax(0, 1fr) 6px ${sidebarWidth}px` }}
      >
        <CanvasViewport />
        {!narrow && (
          <div
            className="sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the side panels"
            onPointerDown={startResize}
          />
        )}
        <aside className={`rightbar ${panelsOpen ? 'open' : ''}`} id="drawing-panels">
          <LayerPanel />
          <BlocksPanel />
          <SnapPanel />
          <PropertiesPanel />
        </aside>
      </main>

      {panelsOpen && (
        <button
          type="button"
          className="panel-scrim"
          aria-label="Close the panels"
          onClick={() => setDrawerOn(null)}
        />
      )}

      <LayoutTabs />
      <CommandLine />
      <StatusBar />
      <PrintDialog />
      <MTextEditor />
      <TextStylesDialog />
    </div>
  )
}

export default App
