/**
 * API Keys management page with table, create dialog, copy-to-clipboard,
 * revoke confirmation, and rate limit usage per key.
 *
 * @example
 * <Route path="api-keys" element={<ApiKeys />} />
 */
import { useState } from 'react'
import { Plus, Copy, Trash2, Eye, EyeOff, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import type { ApiKey } from '@/lib/api'

const initialKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production Frontend',
    key: 'tg_prod_a1b2c3d4e5f6g7h8i9j0k',
    permissions: ['read:users', 'write:orders'],
    expiresAt: '2025-01-15T10:00:00Z',
    active: true,
    rateLimitUsage: 45000,
    createdAt: '2024-01-01T08:00:00Z',
  },
  {
    id: '2',
    name: 'Staging Mobile App',
    key: 'tg_stag_l1m2n3o4p5q6r7s8t9u0v',
    permissions: ['read:*'],
    expiresAt: '2024-12-01T10:00:00Z',
    active: true,
    rateLimitUsage: 12000,
    createdAt: '2024-01-05T10:00:00Z',
  },
  {
    id: '3',
    name: 'Dev Testing',
    key: 'tg_dev_w1x2y3z4a5b6c7d8e9f0g',
    permissions: ['read:*', 'write:*'],
    expiresAt: null,
    active: false,
    rateLimitUsage: 89000,
    createdAt: '2023-06-15T12:00:00Z',
  },
  {
    id: '4',
    name: 'CI/CD Pipeline',
    key: 'tg_ci_h1i2j3k4l5m6n7o8p9q0r',
    permissions: ['read:deployments', 'write:deployments'],
    expiresAt: '2024-06-01T10:00:00Z',
    active: true,
    rateLimitUsage: 5000,
    createdAt: '2024-01-10T14:00:00Z',
  },
]

export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPermissions, setNewKeyPermissions] = useState('read:*')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)

  function handleCreate() {
    const newKey: ApiKey = {
      id: String(Date.now()),
      name: newKeyName,
      key: `tg_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      permissions: newKeyPermissions.split(',').map((p) => p.trim()),
      expiresAt: null,
      active: true,
      rateLimitUsage: 0,
      createdAt: new Date().toISOString(),
    }
    setKeys((prev) => [...prev, newKey])
    setNewKeyName('')
    setNewKeyPermissions('read:*')
    setDialogOpen(false)
  }

  function handleRevoke(id: string) {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, active: false } : k)))
    setRevokeConfirm(null)
  }

  async function handleCopy(key: ApiKey) {
    await navigator.clipboard.writeText(key.key)
    setCopiedId(key.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function toggleVisibility(id: string) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">Manage API authentication keys</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for external services.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g. Production Backend"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="permissions">Permissions (comma-separated)</Label>
                <Input
                  id="permissions"
                  placeholder="read:users, write:orders"
                  value={newKeyPermissions}
                  onChange={(e) => setNewKeyPermissions(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newKeyName}>
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">
                        {visibleKeys.has(key.id)
                          ? key.key
                          : `${key.key.substring(0, 8)}...`}
                      </code>
                      <button
                        type="button"
                        onClick={() => toggleVisibility(key.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {visibleKeys.has(key.id) ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {key.permissions.map((perm) => (
                        <Badge key={perm} variant="outline" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.active ? 'default' : 'secondary'}>
                      {key.active ? 'Active' : 'Revoked'}
                    </Badge>
                  </TableCell>
                  <TableCell>{key.rateLimitUsage.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleCopy(key)}>
                        {copiedId === key.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      {key.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRevokeConfirm(key.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={revokeConfirm !== null}
        onOpenChange={(open) => !open && setRevokeConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The key will immediately stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeConfirm && handleRevoke(revokeConfirm)}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
