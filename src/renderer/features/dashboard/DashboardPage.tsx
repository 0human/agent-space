import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppInfo } from '../../../shared/api'

export function DashboardPage(): ReactElement {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.agentSpace.app
      .getInfo()
      .then((result) => {
        if (result.ok) {
          setAppInfo(result.data)
        } else {
          setError(result.error.message)
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Failed to load app info.')
      })
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>AI Agent Workspace</h1>
        </div>
        <button type="button">New Project</button>
      </header>

      <section className="dashboard-grid">
        <article className="empty-state">
          <span className="eyebrow">First Run</span>
          <h2>Create your first Runtime</h2>
          <p>
            No Runtime is configured yet. Phase 1 can add persistence; Phase 2 can turn this into
            the full Runtime onboarding flow.
          </p>
          <div className="actions">
            <button type="button">Add Runtime</button>
            <button type="button" className="secondary">
              Import Config
            </button>
          </div>
        </article>

        <article>
          <span className="eyebrow">Preload IPC</span>
          <h2>app:getInfo</h2>
          {error ? (
            <p className="error">{error}</p>
          ) : (
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{appInfo?.appVersion ?? 'Loading'}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{appInfo?.platform ?? 'Loading'}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>{appInfo?.databaseReady ? 'Ready' : 'Pending Phase 1'}</dd>
              </div>
            </dl>
          )}
        </article>
      </section>
    </div>
  )
}
