import { FolderKanban, Plus } from 'lucide-react'
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
import type { ProjectPhase, ProjectSummary, RuntimeSummary, TeamSummary } from '../../../shared/api'

type CollaborationChoice = 'none' | `team:${string}` | `runtime:${string}`

const phases: ProjectPhase[] = ['requirements', 'design', 'development', 'testing', 'delivery']

export function ProjectsPage(): ReactElement {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([])
  const [name, setName] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [phase, setPhase] = useState<ProjectPhase>('requirements')
  const [collaboration, setCollaboration] = useState<CollaborationChoice>('none')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    const [projectResult, teamResult, runtimeResult] = await Promise.all([
      window.agentSpace.projects.list(),
      window.agentSpace.teams.list(),
      window.agentSpace.runtimes.list({ enabled: true })
    ])

    if (projectResult.ok) {
      setProjects(projectResult.data)
    }
    if (teamResult.ok) {
      setTeams(teamResult.data)
    }
    if (runtimeResult.ok) {
      setRuntimes(runtimeResult.data)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const defaultAiTeamId = collaboration.startsWith('team:') ? collaboration.slice(5) : undefined
    const defaultAiRuntimeConfigId = collaboration.startsWith('runtime:')
      ? collaboration.slice(8)
      : undefined
    const result = await window.agentSpace.projects.create({
      name,
      localPath,
      phase,
      defaultAiTeamId,
      defaultAiRuntimeConfigId
    })

    if (result.ok) {
      setMessage(result.data.postCreateWarning ?? `Project created: ${result.data.project.name}`)
      setName('')
      setLocalPath('')
      setCollaboration('none')
      await load()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <span className="text-xs font-bold uppercase text-muted-foreground">Projects</span>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">Project Management</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus aria-hidden="true" size={18} />
              <CardTitle>Create Project</CardTitle>
            </div>
            <CardDescription>
              Choose exactly one default collaboration object, or leave it empty.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
              <div className="grid gap-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-path">Local path</Label>
                <Input
                  id="project-path"
                  value={localPath}
                  onChange={(event) => setLocalPath(event.target.value)}
                  placeholder="/path/to/project"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Phase</Label>
                <Select value={phase} onValueChange={(value) => setPhase(value as ProjectPhase)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Default collaboration</Label>
                <Select
                  value={collaboration}
                  onValueChange={(value) => setCollaboration(value as CollaborationChoice)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={`team:${team.id}`}>
                        Team: {team.name}
                      </SelectItem>
                    ))}
                    {runtimes.map((runtime) => (
                      <SelectItem key={runtime.id} value={`runtime:${runtime.id}`}>
                        Runtime: {runtime.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">Save Project</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {projects.length === 0 ? (
            <Card>
              <CardHeader>
                <FolderKanban aria-hidden="true" size={22} />
                <CardTitle>No Projects yet</CardTitle>
                <CardDescription>Create a manual or Team mode project.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="grid gap-3 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <strong>{project.name}</strong>
                      <p className="break-all text-sm text-muted-foreground">{project.localPath}</p>
                    </div>
                    <Badge variant={project.mode === 'team' ? 'success' : 'outline'}>
                      {project.mode}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{project.phase}</Badge>
                    <Badge variant={project.riskStatus === 'normal' ? 'outline' : 'secondary'}>
                      {project.riskStatus}
                    </Badge>
                    <Badge variant="outline">
                      {project.metrics?.activeSessionCount ?? 0} sessions
                    </Badge>
                  </div>
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
