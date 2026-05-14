import { Plus, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card, CardContent } from '@components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@components/ui/select'
import type {
  PermissionDecision,
  PermissionPolicySetSummary,
  PermissionScope
} from '../../../shared/api'

const scopes: PermissionScope[] = ['filesystem', 'command', 'network', 'environment']
const decisions: PermissionDecision[] = ['allow', 'ask', 'deny']

export function PermissionsPage(): ReactElement {
  const [policies, setPolicies] = useState<PermissionPolicySetSummary[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<PermissionScope>('filesystem')
  const [decision, setDecision] = useState<PermissionDecision>('ask')
  const [resource, setResource] = useState('*')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadPolicies(): Promise<void> {
    const result = await window.agentSpace.permissions.listPolicySets()
    if (result.ok) {
      setPolicies(result.data)
    } else {
      setError(result.error.message)
    }
  }

  useEffect(() => {
    void loadPolicies()
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const result = await window.agentSpace.permissions.createPolicySet({
      name,
      rules: [
        {
          scope,
          action: scope === 'network' ? 'request' : scope === 'command' ? 'execute' : 'read',
          decision,
          resources: [resource]
        }
      ]
    })

    if (result.ok) {
      setMessage(`Policy created: ${result.data.name}`)
      setName('')
      setCreateOpen(false)
      await loadPolicies()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Permissions</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">Permission Policies</h1>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      </header>

      <section className="grid gap-3">
        {policies.map((policy) => (
          <Card key={policy.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck aria-hidden="true" size={18} />
                <div>
                  <strong>{policy.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {policy.description ?? 'Custom policy'}
                  </p>
                </div>
              </div>
              <Badge variant={policy.enabled ? 'success' : 'secondary'}>
                {policy.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </section>
      {message ? <p className="mt-4 text-sm font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-medium text-destructive">{error}</p> : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>Create a small reusable policy set.</DialogDescription>
          </DialogHeader>
          <form
            id="policy-create-form"
            className="grid gap-4"
            onSubmit={(event) => void handleCreate(event)}
          >
            <div className="grid gap-2">
              <Label htmlFor="policy-name">Name</Label>
              <Input
                id="policy-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(value) => setScope(value as PermissionScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Decision</Label>
              <Select
                value={decision}
                onValueChange={(value) => setDecision(value as PermissionDecision)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {decisions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="policy-resource">Resource</Label>
              <Input
                id="policy-resource"
                value={resource}
                onChange={(event) => setResource(event.target.value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="policy-create-form">
              Save Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
