import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './site.css'
import App from './App.tsx'
import { initAnalytics } from './core/analytics'
import { initTheme } from './ui/theme'
import { initPreferences } from './core/preferences'

initTheme()
initPreferences()
// Aggregate, cookie-less page counts, and only where a beacon token was built in.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
