import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  FolderClock,
  FolderKanban,
  Plus,
  Workflow,
} from 'lucide-react'

import type { DataTransferNotice, Project } from '../../../../shared/project'
import type { WorkflowRun } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import type { AppPage, ProjectPage } from '@renderer/app/navigation'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

interface ProjectFeatureProps {
  page: ProjectPage
  onNavigate: (page: AppPage) => void
}

export function ProjectFeature({
  page,
  onNavigate,
}: ProjectFeatureProps): React.JSX.Element {
  const api = useAppShell()
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [importWarning, setImportWarning] = useState<string | null>(null)
  const [transferNotice, setTransferNotice] =
    useState<DataTransferNotice | null>(null)
  const [cloneBlocked, setCloneBlocked] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const selectedProject = page.name === 'projectDetail' ? page.project : null

  useEffect(() => {
    void api
      .listProjects()
      .then(setProjects)
      .catch(() => setError(copy.projectOverview.loadError))
  }, [api])

  useEffect(() => {
    if (!selectedProject) return
    void api
      .listWorkflowRuns(selectedProject.id)
      .then(setRuns)
      .catch(() => setRuns([]))
  }, [api, selectedProject?.id])

  useEffect(() => {
    if (!selectedProject) return
    let disposed = false
    const refresh = async (): Promise<void> => {
      try {
        const current = await api.listWorkflowRuns(selectedProject.id)
        if (!disposed) setRuns(current)
      } catch {
        if (!disposed) setRuns([])
      }
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, 500)
    void refresh()
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [api, selectedProject?.id])

  const importProject = async (): Promise<void> => {
    setError(null)
    try {
      const result = await api.importProject()
      if (!result) return
      setProjects((current) => [
        result.project,
        ...current.filter((project) => project.id !== result.project.id),
      ])
      setImportWarning(result.warning)
      setTransferNotice(null)
      setCloneBlocked(null)
      onNavigate({ name: 'projectDetail', project: result.project })
    } catch {
      setError(copy.projectEntry.importError)
    }
  }

  const cloneGitHubProject = async (repositoryUrl: string): Promise<void> => {
    setError(null)
    try {
      const result = await api.cloneGitHubProject(repositoryUrl)
      if (!result) return
      if ('blocked' in result) {
        setCloneBlocked(result.reason)
        setTransferNotice(result.transferNotice)
        return
      }
      setProjects((current) => [
        result.project,
        ...current.filter((project) => project.id !== result.project.id),
      ])
      setImportWarning(result.warning)
      setTransferNotice(result.transferNotice)
      setCloneBlocked(null)
      onNavigate({ name: 'projectDetail', project: result.project })
    } catch {
      setError(copy.projectEntry.importError)
    }
  }

  const openProjectInIde = async (project: Project): Promise<void> => {
    setOpenError(null)
    try {
      const result = await api.openProjectInIde(project.id)
      if (!result.ok) setOpenError(copy.projectDetail.openError)
    } catch {
      setOpenError(copy.projectDetail.openError)
    }
  }

  if (page.name === 'projectOverview') {
    return (
      <ProjectOverview
        projects={projects}
        error={error}
        onCreate={() => {
          setError(null)
          onNavigate({ name: 'createProject' })
        }}
        onResume={() => {
          setError(null)
          onNavigate({ name: 'resumeWork' })
        }}
        onOpen={(project) => {
          setOpenError(null)
          setImportWarning(null)
          setTransferNotice(null)
          onNavigate({ name: 'projectDetail', project })
        }}
      />
    )
  }

  if (page.name === 'createProject' || page.name === 'resumeWork') {
    return (
      <ProjectEntry
        mode={page.name}
        error={error}
        cloneBlocked={cloneBlocked}
        transferNotice={transferNotice}
        onBack={() => onNavigate({ name: 'projectOverview' })}
        onImport={() => {
          void importProject()
        }}
        onClone={(repositoryUrl) => {
          void cloneGitHubProject(repositoryUrl)
        }}
      />
    )
  }

  return (
    <ProjectDetail
      project={page.project}
      runs={runs}
      openError={openError}
      importWarning={importWarning}
      transferNotice={transferNotice}
      onBack={() => onNavigate({ name: 'projectOverview' })}
      onOpenInIde={() => {
        void openProjectInIde(page.project)
      }}
      onViewWorkflow={() =>
        onNavigate({ name: 'workflow', project: page.project })
      }
      onOpenRun={(run) =>
        onNavigate({ name: 'run', project: page.project, run })
      }
    />
  )
}

function PageHeader({
  eyebrow,
  context,
}: {
  eyebrow: string
  context?: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-7 items-center justify-between border-b border-border pb-4 text-[11px] font-semibold text-muted-foreground">
      <p>{eyebrow}</p>
      {context ? <p className="font-normal">{context}</p> : null}
    </div>
  )
}

function ProjectOverview({
  projects,
  error,
  onCreate,
  onResume,
  onOpen,
}: {
  projects: Project[]
  error: string | null
  onCreate: () => void
  onResume: () => void
  onOpen: (project: Project) => void
}): React.JSX.Element {
  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="project-overview-title"
    >
      <PageHeader
        eyebrow={copy.projectOverview.eyebrow}
        context={copy.projectOverview.count(projects.length)}
      />
      {error ? (
        <Alert variant="destructive" className="mt-5" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {projects.length > 0 ? (
        <section className="py-8" aria-label={copy.projectOverview.listLabel}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                id="project-overview-title"
                className="text-3xl font-semibold tracking-tight"
              >
                {copy.projectOverview.listTitle}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {copy.projectOverview.listDescription}
              </p>
            </div>
            <Button type="button" onClick={onCreate}>
              <Plus aria-hidden="true" />
              {copy.projectOverview.importAction}
            </Button>
          </div>
          <div className="grid gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="py-0 transition-colors hover:border-primary/40"
              >
                <button
                  className="flex w-full items-center gap-4 p-5 text-left"
                  type="button"
                  onClick={() => onOpen(project)}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">
                      {project.name}
                    </strong>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {project.workspacePath}
                    </span>
                  </span>
                  <Badge
                    variant={
                      project.workspaceAvailable === false
                        ? 'destructive'
                        : project.dirty
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {project.workspaceAvailable !== false
                      ? project.dirty
                        ? copy.projectOverview.dirty
                        : copy.projectOverview.clean
                      : copy.projectOverview.unavailable}
                  </Badge>
                  <ArrowRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex w-full max-w-2xl flex-1 flex-col justify-center py-12 sm:py-20">
          <div
            className="mb-6 grid size-14 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <FolderKanban className="size-7" strokeWidth={1.6} />
          </div>
          <h1
            id="project-overview-title"
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {copy.projectOverview.title}
          </h1>
          <p className="mt-3 max-w-lg text-base leading-7 text-muted-foreground">
            {copy.projectOverview.description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={onCreate}>
              <Plus aria-hidden="true" />
              {copy.projectOverview.createAction}
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="outline" type="button" onClick={onResume}>
              <FolderClock aria-hidden="true" />
              {copy.projectOverview.resumeAction}
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}

function ProjectEntry({
  mode,
  error,
  cloneBlocked,
  transferNotice,
  onBack,
  onImport,
  onClone,
}: {
  mode: 'createProject' | 'resumeWork'
  error: string | null
  cloneBlocked: string | null
  transferNotice: DataTransferNotice | null
  onBack: () => void
  onImport: () => void
  onClone: (url: string) => void
}): React.JSX.Element {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const isCreate = mode === 'createProject'
  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="project-entry-title"
    >
      <PageHeader
        eyebrow={
          isCreate
            ? copy.projectEntry.createEyebrow
            : copy.projectEntry.resumeEyebrow
        }
      />
      <section className="w-full max-w-2xl py-8">
        <Button
          variant="ghost"
          className="mb-6 -ml-3"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.projectEntry.backAction}
        </Button>
        <h1
          id="project-entry-title"
          className="text-3xl font-semibold tracking-tight"
        >
          {isCreate
            ? copy.projectEntry.createTitle
            : copy.projectEntry.resumeTitle}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {copy.projectEntry.description}
        </p>
        <Button className="mt-7" type="button" onClick={onImport}>
          <FolderKanban aria-hidden="true" />
          {copy.projectEntry.chooseAction}
        </Button>
        {isCreate ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>
                <h2>GitHub</h2>
              </CardTitle>
              <CardDescription>
                {copy.projectEntry.githubUrlPlaceholder}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <label
                className="text-sm font-medium"
                htmlFor="github-repository-url"
              >
                {copy.projectEntry.githubUrlLabel}
              </label>
              <Input
                id="github-repository-url"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder={copy.projectEntry.githubUrlPlaceholder}
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => onClone(repositoryUrl)}
                disabled={!repositoryUrl.trim()}
              >
                <FolderKanban aria-hidden="true" />
                {copy.projectEntry.githubCloneAction}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {cloneBlocked ? (
          <Alert className="mt-5" role="status">
            <AlertTitle>
              {copy.projectEntry.cloneBlocked(cloneBlocked)}
            </AlertTitle>
            {transferNotice ? (
              <AlertDescription>
                {transferNotice.destination}
                <br />
                {transferNotice.data}
                <br />
                {transferNotice.permissions}
                <br />
                {transferNotice.recovery}
              </AlertDescription>
            ) : null}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </section>
    </main>
  )
}

function ProjectDetail({
  project,
  runs,
  openError,
  importWarning,
  transferNotice,
  onBack,
  onOpenInIde,
  onViewWorkflow,
  onOpenRun,
}: {
  project: Project
  runs: WorkflowRun[]
  openError: string | null
  importWarning: string | null
  transferNotice: DataTransferNotice | null
  onBack: () => void
  onOpenInIde: () => void
  onViewWorkflow: () => void
  onOpenRun: (run: WorkflowRun) => void
}): React.JSX.Element {
  const available = project.workspaceAvailable !== false
  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="project-detail-title"
    >
      <PageHeader eyebrow={copy.projectDetail.eyebrow} />
      <section className="py-8">
        <Button
          variant="ghost"
          className="mb-6 -ml-3"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.projectDetail.backAction}
        </Button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1
              id="project-detail-title"
              className="truncate text-3xl font-semibold tracking-tight"
            >
              {project.name}
            </h1>
            <p className="mt-2 truncate text-sm text-muted-foreground">
              {project.workspacePath}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={onViewWorkflow}
              disabled={!available}
            >
              <Workflow aria-hidden="true" />
              {copy.workflow.viewAction}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={onOpenInIde}
              disabled={!available}
            >
              <FolderKanban aria-hidden="true" />
              {copy.projectDetail.openInIde}
            </Button>
          </div>
        </div>
        {!available ? (
          <Alert variant="destructive" className="mt-6" role="alert">
            <AlertTitle>{copy.projectDetail.unavailable}</AlertTitle>
            <AlertDescription>
              {copy.projectDetail.unavailableDescription}
            </AlertDescription>
          </Alert>
        ) : project.dirty ? (
          <Alert className="mt-6" role="status">
            <AlertTitle>{copy.projectDetail.dirtyTitle}</AlertTitle>
            <AlertDescription>
              {importWarning ?? copy.projectDetail.dirtyDescription}
            </AlertDescription>
          </Alert>
        ) : null}
        {openError ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertDescription>{openError}</AlertDescription>
          </Alert>
        ) : null}
        {transferNotice ? (
          <Alert
            className="mt-5"
            aria-label={copy.projectDetail.transferNoticeTitle}
          >
            <AlertTitle>{copy.projectDetail.transferNoticeTitle}</AlertTitle>
            <AlertDescription>
              <span className="block">
                {copy.projectDetail.transferDestination}:{' '}
                {transferNotice.destination}
              </span>
              <span className="block">{transferNotice.data}</span>
              <span className="block">{transferNotice.permissions}</span>
              <span className="block">{transferNotice.recovery}</span>
            </AlertDescription>
          </Alert>
        ) : null}
        <Card className="mt-7">
          <CardContent className="grid gap-px p-0 sm:grid-cols-2">
            <Metadata
              label={copy.projectDetail.remote}
              value={project.remote ?? copy.projectDetail.notConfigured}
            />
            <Metadata
              label={copy.projectDetail.type}
              value={
                project.isGreenfield
                  ? copy.projectDetail.greenfieldProject
                  : copy.projectDetail.gitProject
              }
            />
            <Metadata
              label={copy.projectDetail.currentBranch}
              value={project.currentBranch ?? copy.projectDetail.detached}
            />
            <Metadata
              label={copy.projectDetail.head}
              value={
                project.head
                  ? project.head.slice(0, 12)
                  : copy.projectDetail.noCommit
              }
            />
            <Metadata
              label={copy.projectDetail.defaultBranch}
              value={project.defaultBranch ?? copy.projectDetail.notConfigured}
            />
            <Metadata
              label={copy.projectDetail.workspaceStatus}
              value={
                project.dirty
                  ? copy.projectDetail.dirty
                  : copy.projectDetail.clean
              }
            />
            <Metadata
              label={copy.projectDetail.changedFiles}
              value={String(project.dirtySummary.files.length)}
            />
          </CardContent>
        </Card>
        {project.dirty ? (
          <Card className="mt-4" aria-label={copy.projectDetail.dirtyTitle}>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {copy.projectDetail.dirtySummary.staged(
                    project.dirtySummary.staged,
                  )}
                </Badge>
                <Badge variant="outline">
                  {copy.projectDetail.dirtySummary.unstaged(
                    project.dirtySummary.unstaged,
                  )}
                </Badge>
                <Badge variant="outline">
                  {copy.projectDetail.dirtySummary.untracked(
                    project.dirtySummary.untracked,
                  )}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                <strong className="mr-2 text-foreground">
                  {copy.projectDetail.dirtySummary.files}
                </strong>
                {project.dirtySummary.files.join(', ')}
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Separator className="my-8" />
        <section aria-labelledby="run-list-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="run-list-title" className="text-xl font-semibold">
                {copy.run.listTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.run.listDescription}
              </p>
            </div>
            <Badge variant="secondary">{copy.run.count(runs.length)}</Badge>
          </div>
          {runs.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {runs.map((run) => (
                <Card key={run.id} className="py-0">
                  <button
                    className="flex w-full items-center gap-4 p-5 text-left"
                    type="button"
                    onClick={() => onOpenRun(run)}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block">{run.idea}</strong>
                      <small className="mt-1 block text-muted-foreground">
                        {run.workflowId}@{run.workflowVersion}
                      </small>
                      <small className="block text-muted-foreground">
                        {copy.run.runId(run.id)}
                      </small>
                      <small className="block text-muted-foreground">
                        {copy.run.currentPhase(
                          run.definition.phases[run.snapshot.phaseIndex]
                            ?.name ??
                            copy.run.phase(run.snapshot.phaseIndex + 1),
                        )}
                      </small>
                      {run.snapshot.blockedBy ? (
                        <small className="block text-destructive">
                          {copy.run.blockedReason(
                            run.snapshot.blockedBy.reason,
                          )}
                        </small>
                      ) : null}
                      {run.artifacts.length > 0 ? (
                        <small className="block text-muted-foreground">
                          {copy.run.recentArtifact(run.artifacts.at(-1)!.name)}
                        </small>
                      ) : null}
                    </span>
                    <Badge
                      variant={
                        run.status === 'failed' || run.status === 'blocked'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {copy.run.status[run.status]}
                    </Badge>
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </Card>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              {copy.run.empty}
            </p>
          )}
        </section>
      </section>
    </main>
  )
}

function Metadata({
  label,
  value,
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="min-w-0 border-b border-border p-4 last:border-b-0 sm:odd:border-r">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
    </div>
  )
}
