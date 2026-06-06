/**
 * Main application layout combining Sidebar, Navbar, and content area.
 * Wraps route children with consistent chrome.
 *
 * @example
 * <Route element={<AppLayout />}>
 *   <Route path="dashboard" element={<Dashboard />} />
 * </Route>
 */
import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Navbar } from './navbar'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Navbar />
      <main className="ml-60 mt-14 p-6">
        <Outlet />
      </main>
    </div>
  )
}
