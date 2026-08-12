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
import { zhCN as copy } from './i18n/zh-CN'

type View = 'projectOverview' | 'createProject' | 'resumeWork' | 'settings'

const platformNames: Partial<Record<NodeJS.Platform, string>> = {
  darwin: copy.platform.darwin,
  linux: copy.platform.linux,
  win32: copy.platform.win32
}

interface ProjectOverviewProps {
  onCreateProject: () => void
  onResumeWork: () => void
}

function ProjectOverview({ onCreateProject, onResumeWork }: ProjectOverviewProps): React.JSX.Element {
  return (
    <main className="content" aria-labelledby="project-overview-title">
      <div className="content-header">
        <p className="eyebrow">{copy.projectOverview.eyebrow}</p>
        <p className="content-context">{copy.projectOverview.count}</p>
      </div>

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
    </main>
  )
}

interface ProjectEntryProps {
  mode: 'createProject' | 'resumeWork'
  onBack: () => void
}

function ProjectEntry({ mode, onBack }: ProjectEntryProps): React.JSX.Element {
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

  useEffect(() => {
    document.title = copy.app.name
  }, [])

  const content = view === 'projectOverview'
    ? (
        <ProjectOverview
          onCreateProject={() => setView('createProject')}
          onResumeWork={() => setView('resumeWork')}
        />
      )
    : view === 'settings'
      ? <SettingsView />
      : <ProjectEntry mode={view} onBack={() => setView('projectOverview')} />

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
