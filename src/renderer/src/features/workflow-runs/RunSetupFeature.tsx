import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import type { Project } from '../../../../shared/project'
import type { WorkflowView } from '../../../../shared/workflow'
import type { WorkflowPreflightResult } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import type { AppPage } from '@renderer/app/navigation'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { PreflightResult } from '../workflows/PreflightResult'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { useProjectRun } from './use-project-run'

export function RunSetupFeature({ project, workflow, onNavigate }: {
  project: Project
  workflow: WorkflowView
  onNavigate: (page: AppPage) => void
}): React.JSX.Element {
  const api = useAppShell()
  const projectRun = useProjectRun(project.id)
  useEffect(() => {
    if (projectRun.run) onNavigate({ name: 'run', project, run: projectRun.run })
  }, [projectRun.run, project, onNavigate])
  const [idea, setIdea] = useState('')
  const [pending, setPending] = useState<'checking' | 'starting' | null>(null)
  const inFlight = useRef(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const [preflight, setPreflight] = useState<WorkflowPreflightResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firstPhase = workflow.definition.phases[0]
  const firstStep = firstPhase?.steps[0]

  async function start(): Promise<void> {
    if (inFlight.current || projectRun.loading || projectRun.error || projectRun.run || !idea.trim() || !workflow.canStart) return
    inFlight.current = true
    setPending('checking')
    setError(null)
    setPreflight(null)
    try {
      const checked = await api.preflightWorkflowRun(project.id, idea.trim())
      if (!active.current) return
      setPreflight(checked)
      if (!checked.passed) return
      setPending('starting')
      const result = await api.startWorkflowRun(project.id, idea.trim())
      if (!active.current) return
      if (result.run) onNavigate({ name: 'run', project, run: result.run })
      else setError(result.error ?? copy.workflow.startError)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.workflow.startError)
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  return (
    <main className="flex h-[calc(100dvh-3rem)] min-w-0 flex-col md:h-dvh" aria-labelledby="new-run-title">
      <header className="shrink-0 border-b px-4 py-3 sm:px-8">
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => onNavigate({ name: 'workflow', project })}>
          <ArrowLeft aria-hidden="true" />{copy.run.backToWorkflow}
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 id="new-run-title" className="text-lg font-semibold">{copy.run.newRunTitle}</h1>
          <Badge variant="secondary">{copy.run.notStarted}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{project.name} · {workflow.definition.name} · {copy.workflow.version(workflow.definition.version)}</p>
      </header>
      <section className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-8" aria-label={copy.run.runPreparation}>
        <div className="py-6">
          <h2 className="text-xl font-semibold">{copy.run.ideaPrompt}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{copy.workflow.launchDescription}</p>
          {firstStep ? <p className="mt-4 text-sm">{copy.run.firstStep(firstPhase.name, firstStep.name)}</p> : null}
        </div>
        {project.dirty ? (
          <Alert>
            <AlertTitle>{copy.projectDetail.dirtyTitle}</AlertTitle>
            <AlertDescription>
              <p>{copy.projectDetail.dirtyDescription}</p>
              <p className="break-words">{project.dirtySummary.files.join(', ')}</p>
            </AlertDescription>
          </Alert>
        ) : null}
        <p className="text-xs text-muted-foreground">{copy.run.startCheckHint}</p>
        {preflight ? <PreflightResult result={preflight} /> : null}
        {projectRun.error ? <Alert variant="destructive" role="alert"><AlertDescription>{projectRun.error}</AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
      </section>
      <footer className="shrink-0 border-t px-4 py-4 sm:px-8">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void start() }}>
          <label className="text-sm" htmlFor="new-run-idea">{copy.workflow.ideaLabel}</label>
          <Textarea id="new-run-idea" autoFocus value={idea} disabled={pending !== null || projectRun.loading || Boolean(projectRun.error) || Boolean(projectRun.run)} placeholder={copy.workflow.ideaPlaceholder} onChange={(event) => { setIdea(event.target.value); setPreflight(null); setError(null) }} />
          <Button className="w-fit" type="submit" disabled={pending !== null || projectRun.loading || Boolean(projectRun.error) || Boolean(projectRun.run) || !idea.trim() || !workflow.canStart}>
            <ArrowRight aria-hidden="true" />
            {pending === 'checking' ? copy.workflow.checking : pending === 'starting' ? copy.workflow.starting : copy.workflow.startAction}
          </Button>
        </form>
      </footer>
    </main>
  )
}
