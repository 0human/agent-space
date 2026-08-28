import { useEffect, useState } from 'react'

import type { RuntimeInfo } from '../../../../shared/app-shell'
import { useAppShell } from '@renderer/app/app-shell-provider'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { SkillPackageManager } from '@renderer/features/skill-packages/SkillPackageManager'

const platformNames: Partial<Record<NodeJS.Platform, string>> = {
  darwin: copy.platform.darwin,
  linux: copy.platform.linux,
  win32: copy.platform.win32,
}

export function SettingsFeature(): React.JSX.Element {
  const api = useAppShell()
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .getRuntimeInfo()
      .then(setRuntimeInfo)
      .catch(() => setRuntimeError(copy.settings.runtimeError))
  }, [api])

  return (
    <main
      className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-14"
      aria-labelledby="settings-title"
    >
      <div className="flex min-h-7 items-center border-b border-border pb-4 text-[11px] font-semibold text-muted-foreground">
        <p>{copy.settings.eyebrow}</p>
      </div>
      <section className="py-8">
        <h1
          id="settings-title"
          className="text-3xl font-semibold tracking-tight"
        >
          {copy.settings.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.settings.description}
        </p>
        <div className="mt-7 grid gap-5">
          <Card aria-labelledby="runtime-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="runtime-heading">{copy.settings.runtimeSection}</h2>
              </CardTitle>
              <CardDescription>
                {copy.settings.runtimeDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Definition
                  label={copy.settings.operatingSystem}
                  value={
                    runtimeInfo
                      ? (platformNames[runtimeInfo.platform] ??
                        runtimeInfo.platform)
                      : copy.settings.loading
                  }
                />
                <Definition
                  label={copy.settings.appVersion}
                  value={runtimeInfo?.version ?? copy.settings.loading}
                />
              </dl>
              {runtimeError ? (
                <Alert variant="destructive" className="mt-5" role="alert">
                  <AlertDescription>{runtimeError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
          <SkillPackageManager />
        </div>
      </section>
    </main>
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
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
