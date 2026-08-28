import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderKanban,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

import type { Project } from '../../../../shared/project'
import type { WorkflowView } from '../../../../shared/workflow'
import type { WorkflowPreflightResult } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import type { AppPage } from '@renderer/app/navigation'
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
import { Separator } from '@renderer/components/ui/separator'
import { Textarea } from '@renderer/components/ui/textarea'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function WorkflowFeature({
  project,
  onNavigate,
}: {
  project: Project
  onNavigate: (page: AppPage) => void
}): React.JSX.Element {
  const api = useAppShell()
  const [workflow, setWorkflow] = useState<WorkflowView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [idea, setIdea] = useState('')
  const [preflight, setPreflight] = useState<WorkflowPreflightResult | null>(
    null,
  )

  useEffect(() => {
    let disposed = false
    setLoading(true)
    void api
      .getWorkflow(project.id)
      .then((result) => {
        if (!disposed) setWorkflow(result)
      })
      .catch(() => {
        if (!disposed) setError(copy.workflow.loadError)
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [api, project.id])

  const copyWorkflow = async (): Promise<void> => {
    setError(null)
    try {
      const result = await api.copyWorkflow(project.id)
      if (result) setWorkflow(result)
    } catch {
      setError(copy.workflow.copyError)
    }
  }

  const reloadWorkflow = async (): Promise<void> => {
    setError(null)
    try {
      const result = await api.reloadWorkflow(project.id)
      if (result) setWorkflow(result)
    } catch {
      setError(copy.workflow.reloadError)
    }
  }

  const runPreflight = async (): Promise<void> => {
    try {
      setPreflight(await api.preflightWorkflowRun(project.id, idea))
      setError(null)
    } catch {
      setError(copy.workflow.startError)
    }
  }

  const startWorkflowRun = async (): Promise<void> => {
    if (!workflow?.canStart || !preflight?.passed) return
    const result = await api.startWorkflowRun(project.id, idea)
    if (result.ok && result.run)
      onNavigate({ name: 'run', project, run: result.run })
    else setError(result.error ?? copy.workflow.startError)
  }

  const editWorkflow = async (): Promise<void> => {
    const result = await api.openWorkflowFile(project.id)
    if (!result.ok) setError(result.error ?? copy.workflow.editError)
  }

  if (loading || !workflow) {
    return (
      <main
        className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
        aria-busy="true"
      >
        <PageHeader project={project} />
        <p className="py-12 text-sm text-muted-foreground">
          {error ?? copy.workflow.loading}
        </p>
      </main>
    )
  }

  const { definition, validation } = workflow
  const originVersion = definition.derivedFrom?.version
  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="workflow-title"
    >
      <PageHeader project={project} />
      <section className="py-8">
        <Button
          variant="ghost"
          className="mb-6 -ml-3"
          type="button"
          onClick={() => onNavigate({ name: 'projectDetail', project })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.workflow.backAction}
        </Button>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  workflow.source === 'built-in' ? 'secondary' : 'default'
                }
              >
                {workflow.source === 'built-in'
                  ? copy.workflow.readOnly
                  : copy.workflow.projectSource}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {copy.workflow.version(definition.version)}
              </span>
            </div>
            <h1
              id="workflow-title"
              className="mt-3 text-3xl font-semibold tracking-tight"
            >
              {definition.name}
            </h1>
            {workflow.path ? (
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {workflow.path}
              </p>
            ) : null}
            {workflow.source === 'project' && originVersion ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {copy.workflow.origin(originVersion)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {workflow.source === 'built-in' ? (
              <>
                <Button
                  type="button"
                  onClick={() =>
                    document.getElementById('workflow-idea')?.focus()
                  }
                >
                  <ArrowRight aria-hidden="true" />
                  {copy.workflow.directRunAction}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void copyWorkflow()
                  }}
                >
                  <Copy aria-hidden="true" />
                  {copy.workflow.copyAction}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void editWorkflow()
                  }}
                >
                  <FolderKanban aria-hidden="true" />
                  {copy.workflow.editAction}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void reloadWorkflow()
                  }}
                >
                  <RefreshCw aria-hidden="true" />
                  {copy.workflow.reloadAction}
                </Button>
              </>
            )}
          </div>
        </div>
        <Alert
          variant={validation.valid ? 'default' : 'destructive'}
          className="mt-6"
          role={validation.valid ? 'status' : 'alert'}
        >
          {validation.valid ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <ShieldAlert aria-hidden="true" />
          )}
          <AlertTitle>
            {validation.valid
              ? copy.workflow.validationPassed
              : copy.workflow.validationFailed}
          </AlertTitle>
          <AlertDescription>
            {validation.errors.map((message) => (
              <span className="block" key={message}>
                {message}
              </span>
            ))}
          </AlertDescription>
        </Alert>
        {error ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="mt-7" aria-labelledby="run-launcher-title">
          <CardHeader>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {copy.workflow.preflightEyebrow}
            </p>
            <CardTitle>
              <h2 id="run-launcher-title">{copy.workflow.launchTitle}</h2>
            </CardTitle>
            <CardDescription>{copy.workflow.launchDescription}</CardDescription>
            {workflow.source === 'built-in' ? (
              <p className="text-xs text-muted-foreground">
                {copy.workflow.directRunDescription}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="text-sm font-medium" htmlFor="workflow-idea">
              {copy.workflow.ideaLabel}
            </label>
            <Textarea
              id="workflow-idea"
              value={idea}
              onChange={(event) => {
                setIdea(event.target.value)
                setPreflight(null)
              }}
              placeholder={copy.workflow.ideaPlaceholder}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  void runPreflight()
                }}
                disabled={!workflow.canStart || !idea.trim()}
              >
                <ShieldAlert aria-hidden="true" />
                {copy.workflow.preflightAction}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void startWorkflowRun()
                }}
                disabled={!preflight?.passed}
              >
                <ArrowRight aria-hidden="true" />
                {copy.workflow.startAction}
              </Button>
            </div>
            {preflight ? (
              <Alert
                variant={preflight.passed ? 'default' : 'destructive'}
                role={preflight.passed ? 'status' : 'alert'}
              >
                <AlertDescription>
                  {preflight.checks.map((check) => (
                    <span className="block" key={check}>
                      {check}
                    </span>
                  ))}
                  {preflight.errors.map((message) => (
                    <span className="block" key={message}>
                      {message}
                    </span>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
        <div className="mt-8 grid gap-5" aria-label={copy.workflow.phaseList}>
          {definition.phases.map((phase, phaseIndex) => (
            <Card key={phase.id} aria-labelledby={`phase-${phase.id}`}>
              <CardHeader className="sm:flex-row sm:items-start">
                <Badge variant="outline" className="w-fit">
                  {String(phaseIndex + 1).padStart(2, '0')}
                </Badge>
                <div>
                  <CardTitle>
                    <h2 id={`phase-${phase.id}`}>{phase.name}</h2>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {phase.goal}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {phase.steps.map((step) => (
                  <div
                    className="rounded-lg border border-border p-4"
                    key={step.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{step.name}</strong>
                      <Badge variant="secondary">
                        {copy.workflow.kind[step.kind]}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      {step.skill ? (
                        <span>
                          <b className="mr-2 text-foreground">Skill</b>
                          {step.skill.name}@{step.skill.version}
                        </span>
                      ) : null}
                      {step.artifacts?.length ? (
                        <span>
                          <b className="mr-2 text-foreground">Artifact</b>
                          {step.artifacts.join(', ')}
                        </span>
                      ) : null}
                      {step.condition ? (
                        <span>
                          <b className="mr-2 text-foreground">Condition</b>
                          {step.condition}
                        </span>
                      ) : null}
                      {step.approvalGate ? (
                        <span>
                          <b className="mr-2 text-foreground">Approval Gate</b>
                          {step.approvalGate}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <Separator className="my-8" />
        <section aria-labelledby="skill-package-title">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {copy.workflow.skillPackageEyebrow}
          </p>
          <h2 id="skill-package-title" className="mt-2 text-xl font-semibold">
            {copy.workflow.skillPackageTitle}
          </h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {workflow.skillManifests.map((manifest) => (
              <Card key={manifest.name}>
                <CardHeader>
                  <CardTitle>
                    <h3>
                      {manifest.name}@{manifest.version}
                    </h3>
                  </CardTitle>
                  <CardDescription>{manifest.entry}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-2 text-sm">
                    <Definition
                      label="Runtime"
                      value={manifest.supportedRuntimes.join(', ')}
                    />
                    <Definition
                      label={copy.workflow.dependencies}
                      value={
                        manifest.dependencies.join(', ') || copy.workflow.none
                      }
                    />
                    <Definition
                      label={copy.workflow.permissions}
                      value={manifest.requiredPermissions.join(', ')}
                    />
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function PageHeader({ project }: { project: Project }): React.JSX.Element {
  return (
    <div className="flex min-h-7 items-center justify-between border-b border-border pb-4 text-[11px] font-semibold text-muted-foreground">
      <p>{copy.workflow.eyebrow}</p>
      <p className="font-normal">{project.name}</p>
    </div>
  )
}

function Definition({
  label,
  value,
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}
