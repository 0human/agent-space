import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderClock,
  FolderKanban,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Workflow
} from 'lucide-react'

import type { RuntimeInfo } from '../../shared/app-shell'
import type { Project } from '../../shared/project'
import type { WorkflowView as WorkflowViewModel } from '../../shared/workflow'
import { zhCN as copy } from './i18n/zh-CN'

type View = 'projectOverview' | 'createProject' | 'resumeWork' | 'settings' | 'projectDetail' | 'workflow'

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
  onBack: () => void
  onOpenInIde: () => void
  openError: string | null
  importWarning: string | null
  onViewWorkflow: () => void
}

function ProjectDetail({ project, onBack, onOpenInIde, openError, importWarning, onViewWorkflow }: ProjectDetailProps): React.JSX.Element {
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
      </section>
    </main>
  )
}

interface WorkflowViewProps {
  project: Project
  workflow: WorkflowViewModel | null
  loading: boolean
  error: string | null
  onBack: () => void
  onCopy: () => void
  onReload: () => void
  onStart: () => void
  onEdit: () => void
}

function WorkflowView({ project, workflow, loading, error, onBack, onCopy, onReload, onStart, onEdit }: WorkflowViewProps): React.JSX.Element {
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
            <button className="primary-action" type="button" onClick={onStart} disabled={!workflow.canStart}>
              <ArrowRight aria-hidden="true" />{copy.workflow.startAction}
            </button>
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

  useEffect(() => {
    document.title = copy.app.name
  }, [])

  useEffect(() => {
    void window.appShell.listProjects().then(setProjects).catch(() => {
      setError(copy.projectOverview.loadError)
    })
  }, [])

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
    if (!selectedProject || !workflow?.canStart) return
    const result = await window.appShell.startWorkflowRun(selectedProject.id)
    setWorkflowError(result.ok ? copy.workflow.startReady : (result.error ?? copy.workflow.startError))
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
        ? <WorkflowView project={selectedProject} workflow={workflow} loading={workflowLoading} error={workflowError} onBack={() => setView('projectDetail')} onCopy={copyWorkflow} onReload={reloadWorkflow} onStart={startWorkflowRun} onEdit={editWorkflow} />
        : view === 'projectDetail' && selectedProject
          ? <ProjectDetail project={selectedProject} onBack={() => setView('projectOverview')} onOpenInIde={openProjectInIde} openError={openError} importWarning={importWarning} onViewWorkflow={openWorkflow} />
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
