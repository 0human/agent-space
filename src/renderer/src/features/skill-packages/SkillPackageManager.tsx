import { useEffect, useRef, useState } from 'react'
import { Download, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import type {
  InstalledSkillRecord,
  SkillInstallPreview,
  SkillSourceType,
} from '../../../../shared/skill-package'
import { summarizeSkillPackage } from '../../../../shared/skill-package'
import { useAppShell } from '@renderer/app/app-shell-provider'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function SkillPackageManager(): React.JSX.Element {
  const api = useAppShell()
  const [sourceType, setSourceType] =
    useState<SkillSourceType>('local-directory')
  const [sourceValue, setSourceValue] = useState('')
  const [preview, setPreview] = useState<SkillInstallPreview | null>(null)
  const [installed, setInstalled] = useState<InstalledSkillRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const previewButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    void api
      .listInstalledSkills()
      .then(setInstalled)
      .catch(() => setError(copy.skillPackages.listError))
  }, [api])

  const inspect = async (): Promise<void> => {
    if (!sourceValue.trim()) return
    setLoading(true)
    setError(null)
    try {
      setPreview(
        await api.previewSkillInstall({
          type: sourceType,
          value: sourceValue.trim(),
        }),
      )
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const install = async (): Promise<void> => {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      const record = await api.installSkill(preview.source)
      if (record) {
        setInstalled((current) => [
          record,
          ...current.filter(
            (item) => item.installedPath !== record.installedPath,
          ),
        ])
        setPreview(null)
        toast.success(
          copy.skillPackages.installSuccess(
            record.manifest.name,
            record.resolvedVersion,
          ),
        )
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card aria-labelledby="skill-installer-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="skill-installer-heading">{copy.skillPackages.title}</h2>
        </CardTitle>
        <CardDescription>{copy.skillPackages.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3">
          <label className="text-sm font-medium" htmlFor="skill-source-type">
            {copy.skillPackages.sourceType}
          </label>
          <Select
            value={sourceType}
            onValueChange={(value) => {
              setSourceType(value as SkillSourceType)
              setPreview(null)
            }}
          >
            <SelectTrigger id="skill-source-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local-directory">
                {copy.skillPackages.sourceTypes.localDirectory}
              </SelectItem>
              <SelectItem value="archive">
                {copy.skillPackages.sourceTypes.archive}
              </SelectItem>
              <SelectItem value="npm">npm</SelectItem>
              <SelectItem value="npx">npx</SelectItem>
              <SelectItem value="git">Git URL</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-sm font-medium" htmlFor="skill-source-value">
            {copy.skillPackages.sourceValue}
          </label>
          <Input
            id="skill-source-value"
            value={sourceValue}
            onChange={(event) => {
              setSourceValue(event.target.value)
              setPreview(null)
            }}
            placeholder={copy.skillPackages.sourcePlaceholder}
          />
          <Button
            ref={previewButtonRef}
            className="w-fit"
            variant="outline"
            type="button"
            onClick={() => {
              void inspect()
            }}
            disabled={!sourceValue.trim() || loading}
          >
            <ShieldAlert aria-hidden="true" />
            {copy.skillPackages.previewAction}
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <section aria-label={copy.skillPackages.installedLabel}>
          <h3 className="text-sm font-semibold">
            {copy.skillPackages.installedLabel}
          </h3>
          {installed.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {installed.map((record) => (
                <div
                  className="rounded-lg border p-3 text-sm"
                  key={record.installedPath}
                >
                  <strong className="block">
                    {record.manifest.name}@{record.resolvedVersion}
                  </strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {record.source.type}: {record.source.value}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {record.contentHash.slice(0, 16)}...
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {copy.skillPackages.installedEmpty}
            </p>
          )}
        </section>
      </CardContent>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !loading) setPreview(null)
        }}
      >
        {preview ? (
          <DialogContent
            closeLabel={copy.skillPackages.dialogClose}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              previewButtonRef.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>{copy.skillPackages.previewLabel}</DialogTitle>
              <DialogDescription>
                {copy.skillPackages.previewDescription}
              </DialogDescription>
            </DialogHeader>
            <strong>
              {preview.manifest.name}@{preview.resolvedVersion}
            </strong>
            <PreviewDetails preview={preview} />
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setPreview(null)}
                disabled={loading}
              >
                {copy.skillPackages.previewBack}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void install()
                }}
                disabled={loading}
              >
                <Download aria-hidden="true" />
                {copy.skillPackages.installAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  )
}

function PreviewDetails({
  preview,
}: {
  preview: SkillInstallPreview
}): React.JSX.Element {
  const summary = summarizeSkillPackage(preview.manifest)
  return (
    <dl className="grid gap-2 text-sm">
      <Row
        label={copy.skillPackages.source}
        value={`${preview.source.type} ${preview.source.value}`}
      />
      <Row
        label={copy.skillPackages.skills}
        value={summary.skills.join(', ')}
      />
      <Row
        label={copy.skillPackages.dependencies}
        value={summary.dependencies.join(', ') || copy.skillPackages.none}
      />
      <Row
        label={copy.skillPackages.runtimes}
        value={summary.supportedRuntimes.join(', ') || copy.skillPackages.none}
      />
      <Row
        label={copy.skillPackages.permissions}
        value={
          summary.requiredPermissions.join(', ') || copy.skillPackages.none
        }
      />
      <Row label={copy.skillPackages.hash} value={preview.contentHash} />
      {preview.lifecycleScriptsRisk.map((risk) => (
        <div
          className="rounded-md bg-destructive/10 p-2 text-destructive"
          key={risk}
        >
          {risk}
        </div>
      ))}
    </dl>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  )
}
