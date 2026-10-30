import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

const container = document.getElementById('moca-react-chart-root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App container={container} />
    </StrictMode>,
  )
}
