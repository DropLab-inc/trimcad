import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './site.css'
import App from './App.tsx'
import { initAnalytics } from './core/analytics'
import { isLocalHost } from './core/analytics'
import { markEdited, startSessionTracking } from './core/session'
import { useCadStore } from './core/store'
import { initTheme } from './ui/theme'
import { initPreferences } from './core/preferences'
import { installFontFaces } from './ui/fontFaces'

initTheme()
initPreferences()
// The faces the app ships, declared from the same table the plot embeds them from.
installFontFaces()
// Aggregate, cookie-less page counts, and only where a beacon token was built in.
initAnalytics()
// First-party dwell measurement: nothing is sent until the page closes, and a failed send is a
// lost data point, never a broken app. Development hosts never report, the same rule as the beacon.
if (!isLocalHost(window.location.hostname)) startSessionTracking()

// The document changed: the session was used for drawing, not merely open.
useCadStore.subscribe((state, prev) => {
  if (state.doc !== prev.doc) markEdited()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
