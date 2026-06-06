import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { queryClient } from './lib/query-client'

const Router = window.patchlaneDesktop ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <NuqsAdapter>
          <App />
        </NuqsAdapter>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)
