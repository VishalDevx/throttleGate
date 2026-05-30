/**
 * Settings page for gateway configuration including general settings,
 * alert webhooks, Redis status monitoring, and logging level control.
 *
 * @example
 * <Route path="settings" element={<Settings />} />
 */
import { useState } from 'react'
import { Save, Server, Webhook, Signal, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Settings as SettingsType, RedisStatus } from '@/lib/api'

export function Settings() {
  const [settings, setSettings] = useState<SettingsType>({
    gatewayName: 'throttleGate Production',
    defaultRateLimit: 100,
    alertWebhooks: ['https://hooks.slack.com/services/xxx'],
    alertThresholds: {
      errorRate: 5,
      latencyP99: 500,
    },
    loggingLevel: 'info',
  })

  const [redisStatus] = useState<RedisStatus>({
    connected: true,
    latency: 2.3,
    memoryUsage: 45_000_000,
    uptime: 86400 * 7,
  })

  const [webhookInput, setWebhookInput] = useState('')

  function addWebhook() {
    if (webhookInput && !settings.alertWebhooks.includes(webhookInput)) {
      setSettings((prev) => ({
        ...prev,
        alertWebhooks: [...prev.alertWebhooks, webhookInput],
      }))
      setWebhookInput('')
    }
  }

  function removeWebhook(url: string) {
    setSettings((prev) => ({
      ...prev,
      alertWebhooks: prev.alertWebhooks.filter((w) => w !== url),
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage gateway configuration</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <CardTitle>General</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="gatewayName">Gateway Name</Label>
              <Input
                id="gatewayName"
                value={settings.gatewayName}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, gatewayName: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="defaultRateLimit">Default Rate Limit (req/s)</Label>
              <Input
                id="defaultRateLimit"
                type="number"
                value={settings.defaultRateLimit}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultRateLimit: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logLevel">Logging Level</Label>
              <Select
                value={settings.loggingLevel}
                onValueChange={(val: SettingsType['loggingLevel']) =>
                  setSettings((prev) => ({ ...prev, loggingLevel: val }))
                }
              >
                <SelectTrigger id="logLevel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Alert Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Alerts</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="errorThreshold">Error Rate Threshold (%)</Label>
                <Input
                  id="errorThreshold"
                  type="number"
                  value={settings.alertThresholds.errorRate}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      alertThresholds: {
                        ...prev.alertThresholds,
                        errorRate: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="latencyThreshold">P99 Latency Threshold (ms)</Label>
                <Input
                  id="latencyThreshold"
                  type="number"
                  value={settings.alertThresholds.latencyP99}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      alertThresholds: {
                        ...prev.alertThresholds,
                        latencyP99: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Webhook URLs</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://hooks.example.com/..."
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                />
                <Button variant="outline" onClick={addWebhook} disabled={!webhookInput}>
                  Add
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {settings.alertWebhooks.map((url) => (
                  <div
                    key={url}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <code className="text-xs text-muted-foreground">{url}</code>
                    <button
                      type="button"
                      onClick={() => removeWebhook(url)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Redis Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Redis Connection</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Signal
                className={`h-4 w-4 ${redisStatus.connected ? 'text-green-500' : 'text-red-500'}`}
              />
              <span className="text-sm">
                Status:{' '}
                <Badge variant={redisStatus.connected ? 'default' : 'destructive'}>
                  {redisStatus.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Latency</div>
                <div className="font-medium">{redisStatus.latency}ms</div>
              </div>
              <div>
                <div className="text-muted-foreground">Memory</div>
                <div className="font-medium">
                  {(redisStatus.memoryUsage / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Uptime</div>
                <div className="font-medium">
                  {Math.floor(redisStatus.uptime / 86400)}d
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <Card>
          <CardHeader>
            <CardTitle>Save Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Some changes may require a gateway restart to take effect.
            </p>
            <Button className="w-full">
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
