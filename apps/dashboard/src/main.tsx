/**
 * Application entry point. Mounts the React App into the DOM.
 * Uses React 19's createRoot API.
 *
 * @module main
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html has a div with id="root".')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
