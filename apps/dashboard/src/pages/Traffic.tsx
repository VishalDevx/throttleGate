/**
 * Detailed traffic analytics page with top routes, response time distribution,
 * and status code breakdown. Uses recharts for data visualization.
 *
 * @example
 * <Route path="traffic" element={<Traffic />} />
 */
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const COLORS = {
  primary: 'hsl(142 70% 50%)',
  blue: 'hsl(217 91% 60%)',
  amber: 'hsl(35 100% 50%)',
  red: 'hsl(0 72% 51%)',
  muted: 'hsl(0 0% 63.9%)',
}

const routeData = [
  { route: '/api/users', requests: 45200, avgLatency: 24 },
  { route: '/api/orders', requests: 38100, avgLatency: 42 },
  { route: '/api/products', requests: 29500, avgLatency: 18 },
  { route: '/api/auth', requests: 22100, avgLatency: 35 },
  { route: '/api/payments', requests: 12400, avgLatency: 156 },
  { route: '/api/webhooks', requests: 8900, avgLatency: 120 },
]

const latencyDistribution = [
  { range: '0-10ms', count: 85000 },
  { range: '10-50ms', count: 42000 },
  { range: '50-100ms', count: 18000 },
  { range: '100-200ms', count: 7000 },
  { range: '200-500ms', count: 2500 },
  { range: '500ms+', count: 800 },
]

const statusBreakdown = [
  { name: '2xx Success', value: 145000, color: COLORS.primary },
  { name: '4xx Client Error', value: 12000, color: COLORS.amber },
  { name: '5xx Server Error', value: 1500, color: COLORS.red },
]

const timeSeriesData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  requests: Math.floor(Math.random() * 8000 + 2000),
  latency: Math.floor(Math.random() * 60 + 10),
}))

export function Traffic() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Traffic Analytics</h1>
        <p className="text-sm text-muted-foreground">Detailed request and performance metrics</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="routes">Top Routes</TabsTrigger>
          <TabsTrigger value="latency">Latency</TabsTrigger>
          <TabsTrigger value="status">Status Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Requests Over Time (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                  <XAxis dataKey="hour" stroke={COLORS.muted} fontSize={12} />
                  <YAxis stroke={COLORS.muted} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(0 0% 5.9%)',
                      border: '1px solid hsl(0 0% 14.9%)',
                      borderRadius: '0.5rem',
                    }}
                  />
                  <Line type="monotone" dataKey="requests" stroke={COLORS.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Routes by Request Count</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={routeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                  <XAxis type="number" stroke={COLORS.muted} fontSize={12} />
                  <YAxis dataKey="route" type="category" stroke={COLORS.muted} fontSize={12} width={120} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(0 0% 5.9%)',
                      border: '1px solid hsl(0 0% 14.9%)',
                      borderRadius: '0.5rem',
                    }}
                  />
                  <Bar dataKey="requests" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="latency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Response Time Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={latencyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                  <XAxis dataKey="range" stroke={COLORS.muted} fontSize={12} />
                  <YAxis stroke={COLORS.muted} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(0 0% 5.9%)',
                      border: '1px solid hsl(0 0% 14.9%)',
                      borderRadius: '0.5rem',
                    }}
                  />
                  <Bar dataKey="count" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Status Code Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(0 0% 5.9%)',
                        border: '1px solid hsl(0 0% 14.9%)',
                        borderRadius: '0.5rem',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Status Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {statusBreakdown.map((s) => (
                    <div key={s.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                          <span>{s.name}</span>
                        </div>
                        <span className="font-medium">{s.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(s.value / statusBreakdown.reduce((a, b) => a + b.value, 0)) * 100}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
