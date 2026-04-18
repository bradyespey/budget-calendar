//src/main.tsx

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'            // you can drop the .tsx extension
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
