import { Layers3, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@components/ui/select'
import type { AgentProfileSummary, PermissionPolicySetSummary } from '../../../shared/api'

export function AgentProfilesPage(): ReactElement {
  const [profiles, setProfiles] = useState<AgentProfileSummary[]>([])
  const [policies, setPolicies] = useState<PermissionPolicySetSummary[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [policySetId, setPolicySetId] = useState<string>('none')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    const [profileResult, policyResult] = await Promise.all([
      window.agentSpace.agentProfiles.list(),
      window.agentSpace.permissions.listPolicySets()
    ])

    if (profileResult.ok) {
      setProfiles(profileResult.data)
    } else {
      setError(profileResult.error.message)
    }

    if (policyResult.ok) {
      setPolicies(policyResult.data)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const result = await window.agentSpace.agentProfiles.create({
      name,
      description,
      permissionPolicySetIds: policySetId === 'none' ? [] : [policySetId],
      defaultArgs: [],
      envWhitelist: []
    })

    if (result.ok) {
      setMessage(`Profile created: ${result.data.name}`)
      setName('')
      setDescription('')
      setPolicySetId('none')
      await load()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <span className="text-xs font-bold uppercase text-muted-foreground">Agent Profiles</span>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">Reusable Agent Behavior</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus aria-hidden="true" size={18} />
              <CardTitle>Create Profile</CardTitle>
            </div>
            <CardDescription>Bind reusable behavior to one or more policy sets.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
              <div className="grid gap-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-description">Description</Label>
                <Input
                  id="profile-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Policy</Label>
                <Select value={policySetId} onValueChange={setPolicySetId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No policy</SelectItem>
                    {policies.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">Save Profile</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {profiles.length === 0 ? (
            <Card>
              <CardHeader>
                <Layers3 aria-hidden="true" size={22} />
                <CardTitle>No profiles yet</CardTitle>
                <CardDescription>
                  Create a profile to reuse behavior across Runtime, Team, and Session setup.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            profiles.map((profile) => (
              <Card key={profile.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <strong>{profile.name}</strong>
                    <p className="text-sm text-muted-foreground">
                      {profile.description ?? 'No description'}
                    </p>
                  </div>
                  {profile.permissionPreset ? (
                    <Badge variant="outline">{profile.permissionPreset}</Badge>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
      {message ? <p className="mt-4 text-sm font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}
