/**
 * Circuit Breakers management page showing breaker status (closed/open/half-open),
 * failure counts, recovery timeouts, and manual reset capability.
 *
 * @example
 * <Route path="circuit-breakers" element={<CircuitBreakers />} />
 */
import { useState } from 'react'
import { RefreshCw, AlertTriangle, ShieldCheck, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { CircuitBreakerStatus } from '@/lib/api'

const initialBreakers: CircuitBreakerStatus[] = [
  {
    id: '1',
    name: 'users-service',
    state: 'closed',
    failureCount: 2,
    lastFailureTime: '2024-01-15T10:30:00Z',
    recoveryTimeout: 30000,
    healthScore: 95,
  },
  {
    id: '2',
    name: 'orders-service',
    state: 'closed',
    failureCount: 0,
    lastFailureTime: null,
    recoveryTimeout: 30000,
    healthScore: 100,
  },
  {
    id: '3',
    name: 'payments-service',
    state: 'open',
    failureCount: 15,
    lastFailureTime: '2024-01-15T10:28:00Z',
    recoveryTimeout: 60000,
    healthScore: 35,
  },
  {
    id: '4',
    name: 'auth-service',
    state: 'half-open',
    failureCount: 8,
    lastFailureTime: '2024-01-15T10:25:00Z',
    recoveryTimeout: 45000,
    healthScore: 60,
  },
]

const stateColors = {
  closed: 'default' as const,
  open: 'destructive' as const,
  'half-open': 'secondary' as const,
}

const stateIcons = {
  closed: ShieldCheck,
  open: AlertTriangle,
  'half-open': AlertCircle,
}

export function CircuitBreakers() {
  const [breakers, setBreakers] = useState<CircuitBreakerStatus[]>(initialBreakers)

  function handleReset(id: string) {
    setBreakers((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, state: 'closed' as const, failureCount: 0, lastFailureTime: null, healthScore: 100 }
          : b,
      ),
    )
  }

  const overallHealth = Math.round(
    breakers.reduce((sum, b) => sum + b.healthScore, 0) / breakers.length,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Circuit Breakers</h1>
        <p className="text-sm text-muted-foreground">Monitor and manage circuit breaker states</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${
                overallHealth >= 80
                  ? 'text-green-500'
                  : overallHealth >= 50
                    ? 'text-amber-500'
                    : 'text-red-500'
              }`}
            >
              {overallHealth}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {breakers.filter((b) => b.state === 'closed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {breakers.filter((b) => b.state === 'open').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Half-Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">
              {breakers.filter((b) => b.state === 'half-open').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {breakers.map((breaker) => {
          const StateIcon = stateIcons[breaker.state]
          return (
            <Card key={breaker.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <StateIcon
                      className={`h-8 w-8 ${
                        breaker.state === 'closed'
                          ? 'text-green-500'
                          : breaker.state === 'open'
                            ? 'text-red-500'
                            : 'text-amber-500'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{breaker.name}</span>
                        <Badge variant={stateColors[breaker.state]}>
                          {breaker.state}
                        </Badge>
                      </div>
                      <div className="mt-1 flex gap-4 text-sm text-muted-foreground">
                        <span>Failures: {breaker.failureCount}</span>
                        <span>Recovery: {(breaker.recoveryTimeout / 1000).toFixed(0)}s</span>
                        <span>
                          Last failure:{' '}
                          {breaker.lastFailureTime
                            ? formatDate(breaker.lastFailureTime)
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Health</div>
                      <div
                        className={`text-lg font-bold ${
                          breaker.healthScore >= 80
                            ? 'text-green-500'
                            : breaker.healthScore >= 50
                              ? 'text-amber-500'
                              : 'text-red-500'
                        }`}
                      >
                        {breaker.healthScore}%
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReset(breaker.id)}
                      disabled={breaker.state === 'closed'}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
