import { Plus, Users } from 'lucide-react'
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
import type { RuntimeSummary, TeamMemberRole, TeamSummary } from '../../../shared/api'

const roles: TeamMemberRole[] = [
  'analyst',
  'architect',
  'developer',
  'tester',
  'reviewer',
  'summarizer'
]

export function TeamsPage(): ReactElement {
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([])
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState<TeamMemberRole>('developer')
  const [runtimeId, setRuntimeId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    const [teamResult, runtimeResult] = await Promise.all([
      window.agentSpace.teams.list(),
      window.agentSpace.runtimes.list({ enabled: true })
    ])

    if (teamResult.ok) {
      setTeams(teamResult.data)
    }
    if (runtimeResult.ok) {
      setRuntimes(runtimeResult.data)
      setRuntimeId((current) => current || runtimeResult.data[0]?.id || '')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const result = await window.agentSpace.teams.create({
      name,
      goal,
      members:
        runtimeId && memberName
          ? [{ name: memberName, role: memberRole, runtimeConfigId: runtimeId }]
          : []
    })

    if (result.ok) {
      setMessage(`Team created: ${result.data.name}`)
      setName('')
      setGoal('')
      setMemberName('')
      await load()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <span className="text-xs font-bold uppercase text-muted-foreground">Teams</span>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">AI Teams</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus aria-hidden="true" size={18} />
              <CardTitle>Create Team</CardTitle>
            </div>
            <CardDescription>Add a Team and optionally its first member.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
              <div className="grid gap-2">
                <Label htmlFor="team-name">Name</Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-goal">Goal</Label>
                <Input
                  id="team-goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member-name">First member</Label>
                <Input
                  id="member-name"
                  value={memberName}
                  onChange={(event) => setMemberName(event.target.value)}
                  placeholder="Developer"
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={memberRole}
                  onValueChange={(value) => setMemberRole(value as TeamMemberRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Runtime</Label>
                <Select
                  value={runtimeId || 'none'}
                  onValueChange={(value) => setRuntimeId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Runtime</SelectItem>
                    {runtimes.map((runtime) => (
                      <SelectItem key={runtime.id} value={runtime.id}>
                        {runtime.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">Save Team</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {teams.length === 0 ? (
            <Card>
              <CardHeader>
                <Users aria-hidden="true" size={22} />
                <CardTitle>No Teams yet</CardTitle>
                <CardDescription>Create a Team to use Team mode projects.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            teams.map((team) => (
              <Card key={team.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <strong>{team.name}</strong>
                    <p className="text-sm text-muted-foreground">{team.goal ?? 'No goal'}</p>
                  </div>
                  <Badge variant="outline">{team.memberCount} members</Badge>
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
