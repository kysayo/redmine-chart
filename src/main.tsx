import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

const rootEl = document.getElementById('moca-react-chart-root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
