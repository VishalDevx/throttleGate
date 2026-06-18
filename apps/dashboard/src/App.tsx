/**
 * Root application component with React Router configuration.
 * Sets up BrowserRouter with all admin routes wrapped in AppLayout.
 *
 * @example
 * // Entry point rendered in main.tsx
 * <App />
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { Dashboard } from '@/pages/Dashboard'
import { Traffic } from '@/pages/Traffic'
import { RateLimits } from '@/pages/RateLimits'
import { CircuitBreakers } from '@/pages/CircuitBreakers'
import { ApiKeys } from '@/pages/ApiKeys'
import { Settings } from '@/pages/Settings'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/traffic" element={<Traffic />} />
          <Route path="/rate-limits" element={<RateLimits />} />
          <Route path="/circuit-breakers" element={<CircuitBreakers />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
