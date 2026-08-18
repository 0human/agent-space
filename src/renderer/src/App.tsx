import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderClock,
  FolderKanban,
  Pause,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Square,
  Workflow
} from 'lucide-react'

import type { RuntimeInfo } from '../../shared/app-shell'
import type { Project } from '../../shared/project'
import type { WorkflowView as WorkflowViewModel } from '../../shared/workflow'
import type { WorkflowPreflightResult, WorkflowRun, WorkflowRunStatus } from '../../shared/workflow-run'
import { zhCN as copy } from './i18n/zh-CN'

type View = 'projectOverview' | 'createProject' | 'resumeWork' | 'settings' | 'projectDetail' | 'workflow' | 'run'

const platformNames: Partial<Record<NodeJS.Platform, string>> = {
  darwin: copy.platform.darwin,
  linux: copy.platform.linux,
  win32: copy.platform.win32
}

interface ProjectOverviewProps {
  onCreateProject: () => void
  onResumeWork: () => void
  projects: Project[]
  onOpenProject: (project: Project) => void
  error: string | null
}

function ProjectOverview({ onCreateProject, onResumeWork, projects, onOpenProject, error }: ProjectOverviewProps): React.JSX.Element {
  const hasProjects = projects.length > 0
  return (
    <main className="content" aria-labelledby="project-overview-title">
      <div className="content-header">
        <p className="eyebrow">{copy.projectOverview.eyebrow}</p>
        <p className="content-context">{copy.projectOverview.count(projects.length)}</p>
      </div>

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      {hasProjects ? (
        <section className="project-list" aria-label={copy.projectOverview.listLabel}>
          <div className="project-list-header">
            <div>
              <h1 id="project-overview-title">{copy.projectOverview.listTitle}</h1>
              <p>{copy.projectOverview.listDescription}</p>
            </div>
            <button className="primary-action" type="button" onClick={onCreateProject}>
              <Plus aria-hidden="true" />
              {copy.projectOverview.importAction}
            </button>
          </div>
          <div className="project-cards">
            {projects.map((project) => (
              <button className="project-card" type="button" key={project.id} onClick={() => onOpenProject(project)}>
                <span className="project-card-main">
                  <strong>{project.name}</strong>
                  <span>{project.workspacePath}</span>
                </span>
                <span className={project.workspaceAvailable !== false ? (project.dirty ? 'project-status is-dirty' : 'project-status') : 'project-status is-unavailable'}>
                  {project.workspaceAvailable !== false
                    ? (project.dirty ? copy.projectOverview.dirty : copy.projectOverview.clean)
                    : copy.projectOverview.unavailable}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <FolderKanban strokeWidth={1.6} />
          </div>
          <div className="empty-copy">
            <h1 id="project-overview-title">{copy.projectOverview.title}</h1>
            <p>{copy.projectOverview.description}</p>
          </div>
          <div className="empty-actions">
            <button className="primary-action" type="button" onClick={onCreateProject}>
              <Plus aria-hidden="true" />
              {copy.projectOverview.createAction}
              <ArrowRight className="action-arrow" aria-hidden="true" />
            </button>
            <button className="secondary-action" type="button" onClick={onResumeWork}>
              <FolderClock aria-hidden="true" />
              {copy.projectOverview.resumeAction}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

interface ProjectEntryProps {
  mode: 'createProject' | 'resumeWork'
  onBack: () => void
  onImport: () => void
  error: string | null
}

function ProjectEntry({ mode, onBack, onImport, error }: ProjectEntryProps): React.JSX.Element {
  const isCreate = mode === 'createProject'
  const eyebrow = isCreate ? copy.projectEntry.createEyebrow : copy.projectEntry.resumeEyebrow
  const title = isCreate ? copy.projectEntry.createTitle : copy.projectEntry.resumeTitle

  return (
    <main className="content" aria-labelledby="project-entry-title">
      <div className="content-header">
        <p className="eyebrow">{eyebrow}</p>
      </div>
      <section className="project-entry">
        <button className="back-action" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {copy.projectEntry.backAction}
        </button>
        <h1 id="project-entry-title">{title}</h1>
        <p>{copy.projectEntry.description}</p>
        <button className="primary-action" type="button" onClick={onImport}>
          <FolderKanban aria-hidden="true" />
          {copy.projectEntry.chooseAction}
        </button>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
      </section>
    </main>
  )
}

interface ProjectDetailProps {
  project: Project
  runs: WorkflowRun[]
  onBack: () => void
  onOpenInIde: () => void
  openError: string | null
  importWarning: string | null
  onViewWorkflow: () => void
  onOpenRun: (run: WorkflowRun) => void
}

function ProjectDetail({ project, runs, onBack, onOpenInIde, openError, importWarning, onViewWorkflow, onOpenRun }: ProjectDetailProps): React.JSX.Element {
  const workspaceAvailable = project.workspaceAvailable !== false

  return (
    <main className="content" aria-labelledby="project-detail-title">
      <div className="content-header">
        <p className="eyebrow">{copy.projectDetail.eyebrow}</p>
      </div>
      <section className="project-detail">
        <button className="back-action" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {copy.projectDetail.backAction}
        </button>
        <div className="project-detail-heading">
          <div>
            <h1 id="project-detail-title">{project.name}</h1>
            <p>{project.workspacePath}</p>
          </div>
          <div className="project-heading-actions">
            <button className="secondary-action" type="button" onClick={onViewWorkflow} disabled={!workspaceAvailable}>
              <Workflow aria-hidden="true" />
              {copy.workflow.viewAction}
            </button>
            <button className="secondary-action" type="button" onClick={onOpenInIde} disabled={!workspaceAvailable}>
              <FolderKanban aria-hidden="true" />
              {copy.projectDetail.openInIde}
            </button>
          </div>
        </div>
        {!workspaceAvailable ? (
          <div className="workspace-unavailable-notice" role="alert">
            <strong>{copy.projectDetail.unavailable}</strong>
            <span>{copy.projectDetail.unavailableDescription}</span>
          </div>
        ) : project.dirty ? (
          <div className="dirty-notice" role="status">
            <strong>{copy.projectDetail.dirtyTitle}</strong>
            <span>{importWarning ?? copy.projectDetail.dirtyDescription}</span>
          </div>
        ) : null}
        {openError ? <p className="error-message" role="alert">{openError}</p> : null}
        <dl className="project-metadata">
          <div><dt>{copy.projectDetail.remote}</dt><dd>{project.remote ?? copy.projectDetail.notConfigured}</dd></div>
          <div><dt>{copy.projectDetail.type}</dt><dd>{project.isGreenfield ? copy.projectDetail.greenfieldProject : copy.projectDetail.gitProject}</dd></div>
          <div><dt>{copy.projectDetail.currentBranch}</dt><dd>{project.currentBranch ?? copy.projectDetail.detached}</dd></div>
          <div><dt>{copy.projectDetail.head}</dt><dd>{project.head ? project.head.slice(0, 12) : copy.projectDetail.noCommit}</dd></div>
          <div><dt>{copy.projectDetail.defaultBranch}</dt><dd>{project.defaultBranch ?? copy.projectDetail.notConfigured}</dd></div>
          <div><dt>{copy.projectDetail.workspaceStatus}</dt><dd>{project.dirty ? copy.projectDetail.dirty : copy.projectDetail.clean}</dd></div>
          <div><dt>{copy.projectDetail.changedFiles}</dt><dd>{project.dirtySummary.files.length}</dd></div>
        </dl>
        {project.dirty ? (
          <div className="dirty-summary" aria-label={copy.projectDetail.dirtyTitle}>
            <div className="dirty-summary-counts">
              <span>{copy.projectDetail.dirtySummary.staged(project.dirtySummary.staged)}</span>
              <span>{copy.projectDetail.dirtySummary.unstaged(project.dirtySummary.unstaged)}</span>
              <span>{copy.projectDetail.dirtySummary.untracked(project.dirtySummary.untracked)}</span>
            </div>
            <div className="dirty-summary-files">
              <span>{copy.projectDetail.dirtySummary.files}</span>
              <span>{project.dirtySummary.files.join(', ')}</span>
            </div>
          </div>
        ) : null}
        <section className="run-list" aria-labelledby="run-list-title">
          <div className="run-list-heading">
            <div>
              <h2 id="run-list-title">Workflow Runs</h2>
              <p>从持久状态恢复进行中、等待用户或 blocked 的 Run。</p>
            </div>
            <span>{runs.length} 个 Run</span>
          </div>
          {runs.length > 0 ? (
            <div className="run-list-items">
              {runs.map((run) => (
                <button className="run-list-item" type="button" key={run.id} onClick={() => onOpenRun(run)}>
                  <span><strong>{run.idea}</strong><small>{run.workflowId}@{run.workflowVersion}</small></span>
                  <span className={`run-status is-${run.status}`}>{runStatusLabel[run.status]}</span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : <p className="run-list-empty">还没有 Workflow Run。</p>}
        </section>
      </section>
    </main>
  )
}

const runStatusLabel: Record<WorkflowRunStatus, string> = {
  running: '运行中',
  paused: '已暂停',
  waiting: '等待用户',
  blocked: '已 blocked',
  failed: 'Step 失败',
  completed: '已完成',
  cancelled: '已取消'
}

interface RunBoardProps {
  run: WorkflowRun
  onBack: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onCancel: () => void
  error: string | null
}

function RunBoard({ run, onBack, onPause, onResume, onRetry, onCancel, error }: RunBoardProps): React.JSX.Element {
  const latestExecutions = new Map<string, WorkflowRun['stepExecutions'][number]>()
  for (const execution of run.stepExecutions) latestExecutions.set(execution.stepId, execution)
  const canPause = run.status === 'running'
  const canResume = ['paused', 'waiting', 'blocked'].includes(run.status)
  const canRetry = run.status === 'failed'
  const canCancel = ['running', 'paused', 'waiting', 'blocked', 'failed'].includes(run.status)

  return (
    <main className="content workflow-content" aria-labelledby="run-board-title">
      <div className="content-header">
        <p className="eyebrow">Workflow Run</p>
        <p className="content-context">{run.workflowId}@{run.workflowVersion}</p>
      </div>
      <section className="run-board-view">
        <button className="back-action" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />返回 Project 详情</button>
        <div className="run-board-heading">
          <div>
            <div className="workflow-source-line"><span className={`run-status is-${run.status}`}>{runStatusLabel[run.status]}</span><span>{run.projectId}</span></div>
            <h1 id="run-board-title">{run.idea}</h1>
            <p>{run.snapshot.nextAction}</p>
          </div>
          <div className="workflow-actions">
            <button className="secondary-action" type="button" onClick={onPause} disabled={!canPause}><Pause aria-hidden="true" />暂停</button>
            <button className="secondary-action" type="button" onClick={onResume} disabled={!canResume}><ArrowRight aria-hidden="true" />继续</button>
            <button className="secondary-action" type="button" onClick={onRetry} disabled={!canRetry}><RotateCcw aria-hidden="true" />重试失败 Step</button>
            <button className="secondary-action" type="button" onClick={onCancel} disabled={!canCancel}><Square aria-hidden="true" />取消 Run</button>
          </div>
        </div>
        {run.error ? <p className="error-message" role="alert">{run.error}</p> : null}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <div className="run-phases" aria-label="Run Board">
          {run.definition.phases.map((phase, phaseIndex) => (
            <section className={phaseIndex === run.snapshot.phaseIndex ? 'run-phase-column is-current' : 'run-phase-column'} key={phase.id}>
              <div className="run-phase-heading"><span>{String(phaseIndex + 1).padStart(2, '0')}</span><h2>{phase.name}</h2></div>
              <div className="run-phase-steps">
                {phase.steps.map((step, stepIndex) => {
                  const execution = latestExecutions.get(step.id)
                  const isCurrent = phaseIndex === run.snapshot.phaseIndex && stepIndex === run.snapshot.stepIndex
                  return <article className={isCurrent ? 'run-step-card is-current' : 'run-step-card'} key={step.id}>
                    <div><strong>{step.name}</strong>{execution ? <span>attempt {execution.attempt}</span> : null}</div>
                    <span className={`run-status is-${execution?.status ?? 'pending'}`}>{execution ? (runStatusLabel[execution.status as WorkflowRunStatus] ?? execution.status) : '待执行'}</span>
                    {execution?.error ? <p>{execution.error}</p> : null}
                    {isCurrent && (run.snapshot.pendingQuestion || run.snapshot.pendingApproval) ? <p>{run.snapshot.pendingQuestion ?? run.snapshot.pendingApproval}</p> : null}
                  </article>
                })}
              </div>
            </section>
          ))}
        </div>
        <section className="run-artifacts" aria-labelledby="run-artifacts-title">
          <h2 id="run-artifacts-title">Artifact 索引</h2>
          {run.artifacts.length > 0 ? run.artifacts.map((artifact) => <div className="run-artifact" key={artifact.id}><strong>{artifact.name}</strong><span>{artifact.type}</span><span>{artifact.location ?? '未提供位置'}</span></div>) : <p>当前还没有 Artifact。</p>}
        </section>
        <section className="run-events" aria-labelledby="run-events-title">
          <h2 id="run-events-title">Workflow Event</h2>
          <div>{run.events.map((event) => <span key={event.id}>{event.type}</span>)}</div>
        </section>
      </section>
    </main>
  )
}

interface WorkflowViewProps {
  project: Project
  workflow: WorkflowViewModel | null
  loading: boolean
  error: string | null
  idea: string
  preflight: WorkflowPreflightResult | null
  onBack: () => void
  onCopy: () => void
  onReload: () => void
  onIdeaChange: (idea: string) => void
  onPreflight: () => void
  onStart: () => void
  onEdit: () => void
}

function WorkflowView({ project, workflow, loading, error, idea, preflight, onBack, onCopy, onReload, onIdeaChange, onPreflight, onStart, onEdit }: WorkflowViewProps): React.JSX.Element {
  if (loading || !workflow) {
    return (
      <main className="content" aria-busy="true">
        <div className="content-header"><p className="eyebrow">{copy.workflow.eyebrow}</p></div>
        <p className="workflow-loading">{error ?? copy.workflow.loading}</p>
      </main>
    )
  }

  const { definition, validation } = workflow
  const originVersion = definition.derivedFrom?.version
  return (
    <main className="content workflow-content" aria-labelledby="workflow-title">
      <div className="content-header">
        <p className="eyebrow">{copy.workflow.eyebrow}</p>
        <p className="content-context">{project.name}</p>
      </div>
      <section className="workflow-view">
        <button className="back-action" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {copy.workflow.backAction}
        </button>
        <div className="workflow-heading">
          <div>
            <div className="workflow-source-line">
              <span className={workflow.source === 'built-in' ? 'source-badge' : 'source-badge is-project'}>
                {workflow.source === 'built-in' ? copy.workflow.readOnly : copy.workflow.projectSource}
              </span>
              <span>{copy.workflow.version(definition.version)}</span>
            </div>
            <h1 id="workflow-title">{definition.name}</h1>
            {workflow.path ? <p className="workflow-path">{workflow.path}</p> : null}
            {workflow.source === 'project' && originVersion ? <p className="workflow-origin">{copy.workflow.origin(originVersion)}</p> : null}
          </div>
          <div className="workflow-actions">
            {workflow.source === 'built-in' ? (
              <button className="primary-action" type="button" onClick={onCopy}>
                <Copy aria-hidden="true" />{copy.workflow.copyAction}
              </button>
            ) : (
              <>
                <button className="secondary-action" type="button" onClick={onEdit}>
                  <FolderKanban aria-hidden="true" />{copy.workflow.editAction}
                </button>
                <button className="secondary-action" type="button" onClick={onReload}>
                  <RefreshCw aria-hidden="true" />{copy.workflow.reloadAction}
                </button>
              </>
            )}
          </div>
        </div>

        <div className={validation.valid ? 'validation-banner is-valid' : 'validation-banner is-invalid'} role={validation.valid ? 'status' : 'alert'}>
          {validation.valid ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
          <div>
            <strong>{validation.valid ? copy.workflow.validationPassed : copy.workflow.validationFailed}</strong>
            {validation.errors.map((message) => <span key={message}>{message}</span>)}
          </div>
        </div>
        {error ? <p className="error-message" role="alert">{error}</p> : null}

        <section className="run-launcher" aria-labelledby="run-launcher-title">
          <div>
            <p className="eyebrow">Run Preflight</p>
            <h2 id="run-launcher-title">输入 Idea，启动 Workflow Run</h2>
            <p>启动前检查 Workspace 和 Project Workflow；检查结果会随 Run 保存。</p>
          </div>
          <label htmlFor="workflow-idea">Idea</label>
          <textarea id="workflow-idea" value={idea} onChange={(event) => onIdeaChange(event.target.value)} placeholder="描述你想推进的 Idea" />
          <div className="run-launcher-actions">
            <button className="secondary-action" type="button" onClick={onPreflight} disabled={!workflow.canStart || !idea.trim()}><ShieldAlert aria-hidden="true" />运行 Preflight</button>
            <button className="primary-action" type="button" onClick={onStart} disabled={!preflight?.passed}><ArrowRight aria-hidden="true" />{copy.workflow.startAction}</button>
          </div>
          {preflight ? <div className={preflight.passed ? 'preflight-result is-valid' : 'preflight-result is-invalid'} role={preflight.passed ? 'status' : 'alert'}>
            {preflight.checks.map((check) => <span key={check}>{check}</span>)}
            {preflight.errors.map((message) => <span key={message}>{message}</span>)}
          </div> : null}
        </section>

        <div className="workflow-phases" aria-label={copy.workflow.phaseList}>
          {definition.phases.map((phase, phaseIndex) => (
            <section className="workflow-phase" key={phase.id} aria-labelledby={'phase-' + phase.id}>
              <div className="phase-heading">
                <span>{String(phaseIndex + 1).padStart(2, '0')}</span>
                <div><h2 id={'phase-' + phase.id}>{phase.name}</h2><p>{phase.goal}</p></div>
              </div>
              <div className="workflow-steps">
                {phase.steps.map((step) => (
                  <div className="workflow-step" key={step.id}>
                    <div className="step-title"><strong>{step.name}</strong><span>{copy.workflow.kind[step.kind]}</span></div>
                    <div className="step-details">
                      {step.skill ? <span><b>Skill</b>{step.skill.name}@{step.skill.version}</span> : null}
                      {step.artifacts?.length ? <span><b>Artifact</b>{step.artifacts.join(', ')}</span> : null}
                      {step.condition ? <span><b>Condition</b>{step.condition}</span> : null}
                      {step.approvalGate ? <span className="gate-detail"><b>Approval Gate</b>{step.approvalGate}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="skill-package" aria-labelledby="skill-package-title">
          <div className="skill-package-heading">
            <p className="eyebrow">{copy.workflow.skillPackageEyebrow}</p>
            <h2 id="skill-package-title">{copy.workflow.skillPackageTitle}</h2>
          </div>
          <div className="skill-manifests">
            {workflow.skillManifests.map((manifest) => (
              <article className="skill-manifest" key={manifest.name}>
                <div><strong>{manifest.name}@{manifest.version}</strong><span>{manifest.entry}</span></div>
                <dl>
                  <div><dt>Runtime</dt><dd>{manifest.supportedRuntimes.join(', ')}</dd></div>
                  <div><dt>{copy.workflow.dependencies}</dt><dd>{manifest.dependencies.join(', ') || copy.workflow.none}</dd></div>
                  <div><dt>{copy.workflow.permissions}</dt><dd>{manifest.requiredPermissions.join(', ')}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function SettingsView(): React.JSX.Element {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)

  useEffect(() => {
    void window.appShell.getRuntimeInfo().then(setRuntimeInfo)
  }, [])

  return (
    <main className="content" aria-labelledby="settings-title">
      <div className="content-header">
        <p className="eyebrow">{copy.settings.eyebrow}</p>
      </div>

      <section className="settings-intro">
        <h1 id="settings-title">{copy.settings.title}</h1>
        <p>{copy.settings.description}</p>
      </section>

      <section className="settings-section" aria-labelledby="runtime-heading">
        <div>
          <h2 id="runtime-heading">{copy.settings.runtimeSection}</h2>
          <p>{copy.settings.runtimeDescription}</p>
        </div>
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.operatingSystem}</dt>
            <dd>{runtimeInfo ? (platformNames[runtimeInfo.platform] ?? runtimeInfo.platform) : copy.settings.loading}</dd>
          </div>
          <div>
            <dt>{copy.settings.appVersion}</dt>
            <dd>{runtimeInfo?.version ?? copy.settings.loading}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('projectOverview')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [importWarning, setImportWarning] = useState<string | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowViewModel | null>(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [idea, setIdea] = useState('')
  const [preflight, setPreflight] = useState<WorkflowPreflightResult | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  useEffect(() => {
    document.title = copy.app.name
  }, [])

  useEffect(() => {
    void window.appShell.listProjects().then(setProjects).catch(() => {
      setError(copy.projectOverview.loadError)
    })
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    void window.appShell.listWorkflowRuns(selectedProject.id).then(setRuns).catch(() => setRuns([]))
  }, [selectedProject])

  useEffect(() => {
    if (view !== 'run' || !selectedRun) return
    let disposed = false
    const refresh = async (): Promise<void> => {
      const current = await window.appShell.getWorkflowRun(selectedRun.id)
      if (!disposed && current) {
        setSelectedRun(current)
        setRuns((existing) => [current, ...existing.filter((run) => run.id !== current.id)])
      }
    }
    const timer = window.setInterval(() => { void refresh() }, 500)
    void refresh()
    return () => { disposed = true; window.clearInterval(timer) }
  }, [view, selectedRun?.id])

  const importProject = async (): Promise<void> => {
    setError(null)
    try {
      const result = await window.appShell.importProject()
      if (!result) return
      setProjects((current) => [result.project, ...current.filter((project) => project.id !== result.project.id)])
      setSelectedProject(result.project)
      setImportWarning(result.warning)
      setView('projectDetail')
    } catch {
      setError(copy.projectEntry.importError)
    }
  }

  const openProjectInIde = async (): Promise<void> => {
    if (!selectedProject) return
    setOpenError(null)
    try {
      const result = await window.appShell.openProjectInIde(selectedProject.id)
      if (!result.ok) setOpenError(copy.projectDetail.openError)
    } catch {
      setOpenError(copy.projectDetail.openError)
    }
  }

  const openWorkflow = async (): Promise<void> => {
    setWorkflowLoading(true)
    setWorkflowError(null)
    setView('workflow')
    setPreflight(null)
    try {
      if (!selectedProject) throw new Error('Project is required')
      setWorkflow(await window.appShell.getWorkflow(selectedProject.id))
    } catch {
      setWorkflowError(copy.workflow.loadError)
    } finally {
      setWorkflowLoading(false)
    }
  }

  const copyWorkflow = async (): Promise<void> => {
    if (!selectedProject) return
    setWorkflowError(null)
    try {
      const result = await window.appShell.copyWorkflow(selectedProject.id)
      if (result) setWorkflow(result)
    } catch {
      setWorkflowError(copy.workflow.copyError)
    }
  }

  const reloadWorkflow = async (): Promise<void> => {
    if (!selectedProject) return
    setWorkflowError(null)
    try {
      const result = await window.appShell.reloadWorkflow(selectedProject.id)
      if (result) setWorkflow(result)
    } catch {
      setWorkflowError(copy.workflow.reloadError)
    }
  }

  const startWorkflowRun = async (): Promise<void> => {
    if (!selectedProject || !workflow?.canStart || !preflight?.passed) return
    const result = await window.appShell.startWorkflowRun(selectedProject.id, idea)
    if (result.ok && result.run) {
      setSelectedRun(result.run)
      setRuns((existing) => [result.run!, ...existing.filter((run) => run.id !== result.run!.id)])
      setRunError(null)
      setView('run')
    } else setWorkflowError(result.error ?? copy.workflow.startError)
  }

  const runPreflight = async (): Promise<void> => {
    if (!selectedProject) return
    try {
      setPreflight(await window.appShell.preflightWorkflowRun(selectedProject.id, idea))
      setWorkflowError(null)
    } catch {
      setWorkflowError(copy.workflow.startError)
    }
  }

  const updateRun = async (operation: () => Promise<WorkflowRun>): Promise<void> => {
    try {
      const updated = await operation()
      setSelectedRun(updated)
      setRuns((existing) => [updated, ...existing.filter((run) => run.id !== updated.id)])
      setRunError(null)
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const editWorkflow = async (): Promise<void> => {
    if (!selectedProject) return
    const result = await window.appShell.openWorkflowFile(selectedProject.id)
    if (!result.ok) setWorkflowError(result.error ?? copy.workflow.editError)
  }

  const content = view === 'projectOverview'
    ? (
        <ProjectOverview
          onCreateProject={() => { setError(null); setView('createProject') }}
          onResumeWork={() => { setError(null); setView('resumeWork') }}
          projects={projects}
          onOpenProject={(project) => { setSelectedProject(project); setOpenError(null); setImportWarning(null); setView('projectDetail') }}
          error={error}
        />
      )
    : view === 'settings'
      ? <SettingsView />
        : view === 'workflow' && selectedProject
        ? <WorkflowView project={selectedProject} workflow={workflow} loading={workflowLoading} error={workflowError} idea={idea} preflight={preflight} onBack={() => setView('projectDetail')} onCopy={copyWorkflow} onReload={reloadWorkflow} onIdeaChange={(value) => { setIdea(value); setPreflight(null) }} onPreflight={runPreflight} onStart={startWorkflowRun} onEdit={editWorkflow} />
        : view === 'run' && selectedRun
          ? <RunBoard run={selectedRun} onBack={() => setView('projectDetail')} onPause={() => { void updateRun(() => window.appShell.pauseWorkflowRun(selectedRun.id)) }} onResume={() => { void updateRun(() => window.appShell.resumeWorkflowRun(selectedRun.id)) }} onRetry={() => { void updateRun(() => window.appShell.retryWorkflowStep(selectedRun.id)) }} onCancel={() => { void updateRun(() => window.appShell.cancelWorkflowRun(selectedRun.id)) }} error={runError} />
        : view === 'projectDetail' && selectedProject
          ? <ProjectDetail project={selectedProject} runs={runs} onBack={() => setView('projectOverview')} onOpenInIde={openProjectInIde} openError={openError} importWarning={importWarning} onViewWorkflow={openWorkflow} onOpenRun={(run) => { setSelectedRun(run); setRunError(null); setView('run') }} />
          : <ProjectEntry mode={view === 'resumeWork' ? 'resumeWork' : 'createProject'} onBack={() => setView('projectOverview')} onImport={importProject} error={error} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Workflow />
          </span>
          <span>{copy.app.name}</span>
        </div>

        <nav className="primary-navigation" aria-label={copy.app.primaryNavigation}>
          <p className="navigation-label">{copy.app.workspace}</p>
          <button
            className={view !== 'settings' ? 'navigation-item is-active' : 'navigation-item'}
            type="button"
            aria-current={view !== 'settings' ? 'page' : undefined}
          onClick={() => setView('projectOverview')}
          >
            <FolderKanban aria-hidden="true" />
            <span>{copy.navigation.projectOverview}</span>
          </button>
          <button
            className={view === 'settings' ? 'navigation-item is-active' : 'navigation-item'}
            type="button"
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => setView('settings')}
          >
            <Settings aria-hidden="true" />
            <span>{copy.navigation.settings}</span>
          </button>
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" aria-hidden="true" />
          <span>{copy.app.localMode}</span>
        </div>
      </aside>

      {content}
    </div>
  )
}
