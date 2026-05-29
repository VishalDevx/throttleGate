/**
 * Rate Limits management page with table of all rules, create/edit/delete dialogs.
 * Each rule includes route pattern, max requests, window duration, burst allowance.
 *
 * @example
 * <Route path="rate-limits" element={<RateLimits />} />
 */
import { useState } from 'react'
import { Plus, Edit, Trash2, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import type { RateLimitConfig } from '@/lib/api'

const initialRules: RateLimitConfig[] = [
  {
    id: '1',
    routePattern: '/api/users/**',
    maxRequests: 100,
    windowDuration: 60,
    burstAllowance: 20,
    active: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    routePattern: '/api/orders/**',
    maxRequests: 50,
    windowDuration: 60,
    burstAllowance: 10,
    active: true,
    createdAt: '2024-01-14T08:00:00Z',
    updatedAt: '2024-01-14T08:00:00Z',
  },
  {
    id: '3',
    routePattern: '/api/auth/login',
    maxRequests: 20,
    windowDuration: 60,
    burstAllowance: 5,
    active: false,
    createdAt: '2024-01-13T12:00:00Z',
    updatedAt: '2024-01-13T12:00:00Z',
  },
  {
    id: '4',
    routePattern: '/api/payments/**',
    maxRequests: 30,
    windowDuration: 60,
    burstAllowance: 5,
    active: true,
    createdAt: '2024-01-12T09:00:00Z',
    updatedAt: '2024-01-12T09:00:00Z',
  },
  {
    id: '5',
    routePattern: '/api/webhooks/**',
    maxRequests: 200,
    windowDuration: 60,
    burstAllowance: 50,
    active: true,
    createdAt: '2024-01-11T14:00:00Z',
    updatedAt: '2024-01-11T14:00:00Z',
  },
  {
    id: '6',
    routePattern: '/api/public/**',
    maxRequests: 500,
    windowDuration: 60,
    burstAllowance: 100,
    active: false,
    createdAt: '2024-01-10T16:00:00Z',
    updatedAt: '2024-01-10T16:00:00Z',
  },
]

const defaultForm: Partial<RateLimitConfig> = {
  routePattern: '',
  maxRequests: 100,
  windowDuration: 60,
  burstAllowance: 10,
  active: true,
}

export function RateLimits() {
  const [rules, setRules] = useState<RateLimitConfig[]>(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<RateLimitConfig>>(defaultForm)

  function openCreate() {
    setEditingId(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(rule: RateLimitConfig) {
    setEditingId(rule.id)
    setForm({ ...rule })
    setDialogOpen(true)
  }

  function handleSave() {
    if (editingId) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? { ...r, ...form, updatedAt: new Date().toISOString() }
            : r,
        ),
      )
    } else {
      setRules((prev) => [
        ...prev,
        {
          ...form as RateLimitConfig,
          id: String(Date.now()),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
    }
    setDialogOpen(false)
  }

  function handleDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function toggleActive(id: string) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, active: !r.active, updatedAt: new Date().toISOString() } : r,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rate Limits</h1>
          <p className="text-sm text-muted-foreground">Manage rate limiting rules</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rate Limit Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route Pattern</TableHead>
                <TableHead>Max Requests</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Burst</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-xs">{rule.routePattern}</TableCell>
                  <TableCell>{rule.maxRequests}</TableCell>
                  <TableCell>{rule.windowDuration}s</TableCell>
                  <TableCell>{rule.burstAllowance}</TableCell>
                  <TableCell>
                    <Badge variant={rule.active ? 'default' : 'secondary'}>
                      {rule.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(rule.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(rule.id)}
                      >
                        {rule.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Rate Limit' : 'Create Rate Limit'}</DialogTitle>
            <DialogDescription>
              Configure rate limiting for a route pattern.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="routePattern">Route Pattern</Label>
              <Input
                id="routePattern"
                placeholder="/api/route/**"
                value={form.routePattern}
                onChange={(e) => setForm((f) => ({ ...f, routePattern: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="maxRequests">Max Requests</Label>
                <Input
                  id="maxRequests"
                  type="number"
                  value={form.maxRequests}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxRequests: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="windowDuration">Window (seconds)</Label>
                <Input
                  id="windowDuration"
                  type="number"
                  value={form.windowDuration}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, windowDuration: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="burstAllowance">Burst Allowance</Label>
              <Input
                id="burstAllowance"
                type="number"
                value={form.burstAllowance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, burstAllowance: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.active ?? true}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
