import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
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
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Dashboard</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">AI Agent Workspace</h1>
        </div>
        <Button type="button">New Project</Button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card>
          <CardHeader>
            <span className="text-xs font-bold uppercase text-muted-foreground">First Run</span>
            <CardTitle>Create your first Runtime</CardTitle>
            <CardDescription>
              No Runtime is configured yet. Phase 2 turns persistence into a usable Runtime setup
              flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button">Add Runtime</Button>
            <Button type="button" variant="secondary">
              Import Config
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-xs font-bold uppercase text-muted-foreground">Preload IPC</span>
            <CardTitle>app:getInfo</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <dl className="grid gap-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-semibold">{appInfo?.appVersion ?? 'Loading'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Platform</dt>
                  <dd className="font-semibold">{appInfo?.platform ?? 'Loading'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Database</dt>
                  <dd className="font-semibold">{appInfo?.databaseReady ? 'Ready' : 'Pending'}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
