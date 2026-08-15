import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  FolderClock,
  FolderKanban,
  Plus,
  Settings,
  Workflow
} from 'lucide-react'

import type { RuntimeInfo } from '../../shared/app-shell'
import type { Project } from '../../shared/project'
import { zhCN as copy } from './i18n/zh-CN'

type View = 'projectOverview' | 'createProject' | 'resumeWork' | 'settings' | 'projectDetail'

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
                <span className={project.dirty ? 'project-status is-dirty' : 'project-status'}>
                  {project.dirty ? copy.projectOverview.dirty : copy.projectOverview.clean}
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
}

function ProjectDetail({ project, onBack, onOpenInIde, openError, importWarning }: ProjectDetailProps): React.JSX.Element {
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
          <button className="secondary-action" type="button" onClick={onOpenInIde}>
            <FolderKanban aria-hidden="true" />
            {copy.projectDetail.openInIde}
          </button>
        </div>
        {project.dirty ? (
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
      : view === 'projectDetail' && selectedProject
        ? <ProjectDetail project={selectedProject} onBack={() => setView('projectOverview')} onOpenInIde={openProjectInIde} openError={openError} importWarning={importWarning} />
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
