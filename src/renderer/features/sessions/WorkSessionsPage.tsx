import { Archive, MessageSquare, Plus, SendHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
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
import { cn } from '@lib/utils'
import type {
  MessageSummary,
  ProjectSummary,
  RuntimeSummary,
  WorkSessionSummary
} from '../../../shared/api'

export function WorkSessionsPage(): ReactElement {
  const [sessions, setSessions] = useState<WorkSessionSummary[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([])
  const [selectedSession, setSelectedSession] = useState<WorkSessionSummary | null>(null)
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [runtimeId, setRuntimeId] = useState('project-default')
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeCount = useMemo(
    () => sessions.filter((session) => !session.archivedAt).length,
    [sessions]
  )

  async function load(): Promise<void> {
    const [sessionResult, projectResult, runtimeResult] = await Promise.all([
      window.agentSpace.sessions.list(),
      window.agentSpace.projects.list(),
      window.agentSpace.runtimes.list({ enabled: true })
    ])

    if (sessionResult.ok) {
      setSessions(sessionResult.data)
      setSelectedSession((current) => current ?? sessionResult.data[0] ?? null)
    } else {
      setError(sessionResult.error.message)
    }
    if (projectResult.ok) {
      setProjects(projectResult.data)
      setProjectId((current) => current || projectResult.data[0]?.id || '')
    }
    if (runtimeResult.ok) {
      setRuntimes(runtimeResult.data)
    }
  }

  async function loadMessages(workSessionId: string): Promise<void> {
    const result = await window.agentSpace.sessions.listMessages({ workSessionId })
    if (result.ok) {
      setMessages(result.data)
    } else {
      setError(result.error.message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (selectedSession) {
      void loadMessages(selectedSession.id)
    } else {
      setMessages([])
    }
  }, [selectedSession])

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const result = await window.agentSpace.sessions.create({
      projectId,
      title,
      goal,
      aiRuntimeConfigId: runtimeId === 'project-default' ? undefined : runtimeId
    })

    if (result.ok) {
      setMessage(`Work Session created: ${result.data.title}`)
      setSelectedSession(result.data)
      setTitle('')
      setGoal('')
      setRuntimeId('project-default')
      setCreateOpen(false)
      await load()
    } else {
      setError(result.error.message)
    }
  }

  async function handleAddMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selectedSession || !draft.trim()) {
      return
    }
    setError(null)
    setMessage(null)

    const result = await window.agentSpace.sessions.addMessage({
      workSessionId: selectedSession.id,
      content: draft
    })

    if (result.ok) {
      setDraft('')
      await loadMessages(selectedSession.id)
      await load()
    } else {
      setError(result.error.message)
    }
  }

  async function handleArchive(): Promise<void> {
    if (!selectedSession) {
      return
    }
    const result = await window.agentSpace.sessions.archive({ id: selectedSession.id })
    if (result.ok) {
      setMessage(`Archived: ${result.data.title}`)
      setSelectedSession(null)
      setMessages([])
      await load()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Work Sessions</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">Session History</h1>
        </div>
        <div className="flex items-center gap-4">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Add
          </Button>
          <div className="grid justify-items-start sm:justify-items-end">
            <strong className="text-3xl font-semibold">{activeCount}</strong>
            <span className="text-sm text-muted-foreground">active sessions</span>
          </div>
        </div>
      </header>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.25fr)]">
        <div className="grid gap-3">
          {sessions.length === 0 ? (
            <Card>
              <CardHeader>
                <MessageSquare aria-hidden="true" size={22} />
                <CardTitle>No Work Sessions yet</CardTitle>
                <CardDescription>Create a session from an existing project.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            sessions.map((session) => (
              <Card
                key={session.id}
                className={cn(selectedSession?.id === session.id && 'border-primary')}
              >
                <CardContent className="grid gap-3 p-3">
                  <button
                    type="button"
                    className="grid gap-1 text-left"
                    onClick={() => setSelectedSession(session)}
                  >
                    <span className="font-semibold">{session.title}</span>
                    <span className="text-sm text-muted-foreground">{session.projectName}</span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{session.status}</Badge>
                    <Badge variant="outline">{session.assignmentMode}</Badge>
                    <Badge variant="outline">{session.messageCount} messages</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-muted-foreground">Messages</span>
                <CardTitle className="mt-1">
                  {selectedSession ? selectedSession.title : 'Select a session'}
                </CardTitle>
                {selectedSession ? (
                  <CardDescription>
                    {selectedSession.goal ?? selectedSession.projectName}
                  </CardDescription>
                ) : null}
              </div>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={!selectedSession}
                onClick={() => void handleArchive()}
              >
                <Archive aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid max-h-[440px] min-h-64 gap-3 overflow-y-auto rounded-md border border-border p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages saved yet.</p>
              ) : (
                messages.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'max-w-[86%] rounded-md border border-border p-3 text-sm',
                      item.role === 'user'
                        ? 'justify-self-end bg-primary text-primary-foreground'
                        : ''
                    )}
                  >
                    <strong className="block text-xs uppercase">{item.role}</strong>
                    <p className="mt-1 whitespace-pre-wrap leading-6">{item.content}</p>
                  </div>
                ))
              )}
            </div>
            <form className="flex gap-2" onSubmit={(event) => void handleAddMessage(event)}>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Save a user message"
                disabled={!selectedSession}
              />
              <Button type="submit" size="icon" disabled={!selectedSession || !draft.trim()}>
                <SendHorizontal aria-hidden="true" />
              </Button>
            </form>
            {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Work Session</DialogTitle>
            <DialogDescription>
              Start with saved history first; CLI execution comes in the next phase.
            </DialogDescription>
          </DialogHeader>
          <form
            id="session-create-form"
            className="grid gap-4"
            onSubmit={(event) => void handleCreate(event)}
          >
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="session-title">Title</Label>
              <Input
                id="session-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="session-goal">Goal</Label>
              <Input
                id="session-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Runtime</Label>
              <Select value={runtimeId} onValueChange={setRuntimeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-default">Project default</SelectItem>
                  {runtimes.map((runtime) => (
                    <SelectItem key={runtime.id} value={runtime.id}>
                      {runtime.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="session-create-form" disabled={!projectId}>
              Save Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
