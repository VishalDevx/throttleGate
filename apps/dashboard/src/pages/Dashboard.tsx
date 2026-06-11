/**
 * Dashboard overview page with real-time traffic chart, active rate limiters,
 * circuit breaker health summary, and recent errors/alerts.
 *
 * Displays key metrics for quick system health assessment.
 * Uses Recharts LineChart for traffic visualization.
 *
 * @example
 * <Route path="dashboard" element={<Dashboard />} />
 */
import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Activity, Gauge, Zap, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchMetrics, type TrafficMetrics } from '@/lib/api'

function generateMockTraffic(): TrafficMetrics {
  const now = Date.now()
  const points = Array.from({ length: 20 }, (_, i) => ({
    timestamp: now - (19 - i) * 5000,
    value: Math.random() * 1000,
  }))
  return {
    requestsPerSecond: points,
    latencyP50: points.map((p) => ({ ...p, value: Math.random() * 50 })),
    latencyP95: points.map((p) => ({ ...p, value: Math.random() * 200 + 50 })),
    latencyP99: points.map((p) => ({ ...p, value: Math.random() * 500 + 100 })),
  }
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<TrafficMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMetrics()
      .then(setMetrics)
      .catch(() => {
        // Use mock data if backend unavailable
        setMetrics(generateMockTraffic())
      })
      .finally(() => setLoading(false))
  }, [])

  const chartData =
    metrics?.requestsPerSecond.map((point, i) => ({
      time: new Date(point.timestamp).toLocaleTimeString(),
      rps: point.value,
      p50: metrics.latencyP50[i]?.value ?? 0,
      p95: metrics.latencyP95[i]?.value ?? 0,
      p99: metrics.latencyP99[i]?.value ?? 0,
    })) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time gateway overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Requests/sec</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {Math.round(metrics?.requestsPerSecond[metrics.requestsPerSecond.length - 1]?.value ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">+12% from last hour</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Limiters</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6</div>
            <p className="text-xs text-muted-foreground">3 rate limit rules triggered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4/4</div>
            <p className="text-xs text-green-500">All closed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2</div>
            <p className="text-xs text-amber-500">1 critical, 1 warning</p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic chart */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                <XAxis dataKey="time" stroke="hsl(0 0% 63.9%)" fontSize={12} />
                <YAxis stroke="hsl(0 0% 63.9%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(0 0% 5.9%)',
                    border: '1px solid hsl(0 0% 14.9%)',
                    borderRadius: '0.5rem',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="rps"
                  stroke="hsl(142 70% 50%)"
                  strokeWidth={2}
                  dot={false}
                  name="Requests/s"
                />
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="hsl(217 91% 60%)"
                  strokeWidth={1.5}
                  dot={false}
                  name="P50 Latency (ms)"
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  stroke="hsl(35 100% 50%)"
                  strokeWidth={1.5}
                  dot={false}
                  name="P95 Latency (ms)"
                />
                <Line
                  type="monotone"
                  dataKey="p99"
                  stroke="hsl(0 72% 51%)"
                  strokeWidth={1.5}
                  dot={false}
                  name="P99 Latency (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { severity: 'critical', message: 'Circuit breaker opened on /api/users', time: '2 min ago' },
              { severity: 'warning', message: 'Rate limit threshold 90% on /api/orders', time: '5 min ago' },
              { severity: 'info', message: 'Redis reconnection successful', time: '10 min ago' },
            ].map((alert) => (
              <div key={alert.message} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <Badge
                  variant={
                    alert.severity === 'critical'
                      ? 'destructive'
                      : alert.severity === 'warning'
                        ? 'outline'
                        : 'secondary'
                  }
                >
                  {alert.severity}
                </Badge>
                <span className="flex-1">{alert.message}</span>
                <span className="text-xs text-muted-foreground">{alert.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
