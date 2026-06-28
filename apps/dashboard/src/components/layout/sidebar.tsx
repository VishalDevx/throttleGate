/**
 * Sidebar navigation component with dark theme.
 * Provides main navigation links for all dashboard sections.
 * Uses lucide-react icons and react-router-dom NavLink for active state.
 *
 * @example
 * <Sidebar />
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Activity,
  Gauge,
  Zap,
  Key,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/traffic', label: 'Traffic', icon: Activity },
  { to: '/rate-limits', label: 'Rate Limits', icon: Gauge },
  { to: '/circuit-breakers', label: 'Circuit Breakers', icon: Zap },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-bold tracking-tight text-primary">throttleGate</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">throttleGate Admin v0.0.1</p>
      </div>
    </aside>
  )
}
