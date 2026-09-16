import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './site.css'
import App from './App.tsx'
import { initAnalytics } from './core/analytics'
import { initTheme } from './ui/theme'
import { initPreferences } from './core/preferences'
import { installFontFaces } from './ui/fontFaces'

initTheme()
initPreferences()
// The faces the app ships, declared from the same table the plot embeds them from.
installFontFaces()
// Aggregate, cookie-less page counts, and only where a beacon token was built in.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
