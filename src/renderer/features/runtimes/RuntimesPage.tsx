import { Bot, FlaskConical, Plus, PowerOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Checkbox } from '@components/ui/checkbox'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@components/ui/select'
import { cn } from '@lib/utils'
import type {
  RuntimeCreateInput,
  RuntimeDetail,
  RuntimeProvider,
  RuntimeSummary,
  RuntimeTestResult
} from '../../../shared/api'

const providerOptions: { value: RuntimeProvider; label: string; command: string }[] = [
  { value: 'claude_code_cli', label: 'Claude Code CLI', command: 'claude' },
  { value: 'codex_cli', label: 'Codex CLI', command: 'codex' },
  { value: 'gemini_cli', label: 'Gemini CLI', command: 'gemini' },
  { value: 'custom_cli', label: 'Custom CLI', command: '' }
]

const defaultForm: RuntimeCreateInput = {
  name: '',
  provider: 'codex_cli',
  executablePath: 'codex',
  defaultArgs: [],
  defaultCwdMode: 'project_root',
  streamEnabled: true,
  enabled: true,
  isDefault: false
}

function providerLabel(provider: RuntimeProvider): string {
  return providerOptions.find((option) => option.value === provider)?.label ?? provider
}

function splitArgs(value: string): string[] {
  return value
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function RuntimesPage(): ReactElement {
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([])
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeDetail | null>(null)
  const [form, setForm] = useState<RuntimeCreateInput>(defaultForm)
  const [defaultArgsText, setDefaultArgsText] = useState('')
  const [secretKind, setSecretKind] = useState('api_key')
  const [secretValue, setSecretValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<RuntimeTestResult | null>(null)
  const [loading, setLoading] = useState(false)

  const activeCount = useMemo(
    () => runtimes.filter((runtime) => runtime.enabled).length,
    [runtimes]
  )

  async function loadRuntimes(): Promise<void> {
    const result = await window.agentSpace.runtimes.list()

    if (result.ok) {
      setRuntimes(result.data)
      if (!selectedRuntime && result.data[0]) {
        void loadRuntime(result.data[0].id)
      }
    } else {
      setError(result.error.message)
    }
  }

  async function loadRuntime(id: string): Promise<void> {
    const result = await window.agentSpace.runtimes.get(id)

    if (result.ok) {
      setSelectedRuntime(result.data)
    } else {
      setError(result.error.message)
    }
  }

  useEffect(() => {
    void loadRuntimes()
  }, [])

  function updateProvider(provider: RuntimeProvider): void {
    const option = providerOptions.find((item) => item.value === provider)
    setForm((current) => ({
      ...current,
      provider,
      executablePath: option?.command ?? ''
    }))
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const input: RuntimeCreateInput = {
      ...form,
      defaultArgs: splitArgs(defaultArgsText),
      secrets: secretValue ? [{ secretKind, value: secretValue }] : []
    }

    const result = await window.agentSpace.runtimes.create(input)
    setLoading(false)

    if (result.ok) {
      setMessage(`Runtime saved: ${result.data.name}`)
      setSelectedRuntime(result.data)
      setForm(defaultForm)
      setDefaultArgsText('')
      setSecretValue('')
      await loadRuntimes()
    } else {
      setError(result.error.message)
    }
  }

  async function handleTest(runtime?: RuntimeSummary): Promise<void> {
    setError(null)
    setTestResult(null)
    const result = runtime
      ? await window.agentSpace.runtimes.test({ runtimeConfigId: runtime.id })
      : await window.agentSpace.runtimes.test({
          provider: form.provider,
          executablePath: form.executablePath,
          defaultArgs: splitArgs(defaultArgsText)
        })

    if (result.ok) {
      setTestResult(result.data)
      if (runtime) {
        await loadRuntimes()
        await loadRuntime(runtime.id)
      }
    } else {
      setError(result.error.message)
    }
  }

  async function handleDisable(runtime: RuntimeSummary): Promise<void> {
    const result = await window.agentSpace.runtimes.delete({ id: runtime.id, mode: 'disable' })

    if (result.ok) {
      setMessage(`Runtime disabled: ${result.data.name}`)
      setSelectedRuntime(result.data)
      await loadRuntimes()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Runtimes</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">Runtime Configuration</h1>
        </div>
        <div className="grid justify-items-start sm:justify-items-end">
          <strong className="text-3xl font-semibold">{runtimes.length}</strong>
          <span className="text-sm text-muted-foreground">{activeCount} enabled</span>
        </div>
      </header>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus aria-hidden="true" size={18} />
              <CardTitle>Add Runtime</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
              <div className="grid gap-2">
                <Label htmlFor="runtime-name">Name</Label>
                <Input
                  id="runtime-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Codex CLI"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(value) => updateProvider(value as RuntimeProvider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="runtime-executable">Executable</Label>
                <Input
                  id="runtime-executable"
                  value={form.executablePath ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, executablePath: event.target.value }))
                  }
                  placeholder="codex"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="runtime-args">Default args</Label>
                <Input
                  id="runtime-args"
                  value={defaultArgsText}
                  onChange={(event) => setDefaultArgsText(event.target.value)}
                  placeholder="--model gpt-5"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="runtime-model">Model</Label>
                <Input
                  id="runtime-model"
                  value={form.model ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder="optional"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="grid gap-2">
                  <Label htmlFor="secret-kind">Secret kind</Label>
                  <Input
                    id="secret-kind"
                    value={secretKind}
                    onChange={(event) => setSecretKind(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="secret-value">Secret value</Label>
                  <Input
                    id="secret-value"
                    type="password"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                    placeholder="Stored encrypted"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox
                  checked={Boolean(form.isDefault)}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isDefault: checked === true }))
                  }
                />
                Default Runtime
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>
                  Save Runtime
                </Button>
                <Button type="button" variant="secondary" onClick={() => void handleTest()}>
                  <FlaskConical aria-hidden="true" />
                  Test
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {runtimes.length === 0 ? (
            <Card>
              <CardHeader>
                <Bot aria-hidden="true" size={22} />
                <CardTitle>No Runtime yet</CardTitle>
                <CardDescription>
                  Create a CLI Runtime to make it available for future projects and sessions.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            runtimes.map((runtime) => (
              <Card
                key={runtime.id}
                className={cn(selectedRuntime?.id === runtime.id && 'border-primary')}
              >
                <CardContent className="grid gap-3 p-3">
                  <button
                    type="button"
                    className="flex items-center justify-between gap-3 text-left"
                    onClick={() => void loadRuntime(runtime.id)}
                  >
                    <span className="grid gap-0.5">
                      <strong className="font-semibold">{runtime.name}</strong>
                      <small className="text-sm text-muted-foreground">
                        {providerLabel(runtime.provider)}
                      </small>
                    </span>
                    <Badge variant={runtime.enabled ? 'success' : 'secondary'}>
                      {runtime.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </button>
                  <div className="flex gap-2">
                    <Button type="button" size="icon" onClick={() => void handleTest(runtime)}>
                      <FlaskConical aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!runtime.enabled}
                      onClick={() => void handleDisable(runtime)}
                    >
                      <PowerOff aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <span className="text-xs font-bold uppercase text-muted-foreground">Detail</span>
            {selectedRuntime ? <CardTitle>{selectedRuntime.name}</CardTitle> : null}
          </CardHeader>
          <CardContent className="grid gap-4">
            {selectedRuntime ? (
              <dl className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="text-right font-semibold">
                    {providerLabel(selectedRuntime.provider)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Executable</dt>
                  <dd className="break-all text-right font-semibold">
                    {selectedRuntime.executablePath ?? 'Unset'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Default args</dt>
                  <dd className="break-all text-right font-semibold">
                    {selectedRuntime.defaultArgs.length
                      ? selectedRuntime.defaultArgs.join(' ')
                      : '[]'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Test</dt>
                  <dd className="text-right font-semibold">
                    {selectedRuntime.lastTestStatus ?? 'Not tested'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Secrets</dt>
                  <dd className="break-all text-right font-semibold">
                    {selectedRuntime.secrets.length
                      ? selectedRuntime.secrets
                          .map((secret) => `${secret.secretKind}: ${secret.maskedValue ?? 'set'}`)
                          .join(', ')
                      : 'None'}
                  </dd>
                </div>
              </dl>
            ) : (
              <CardDescription>Select or create a Runtime.</CardDescription>
            )}

            {testResult ? (
              <div
                className={cn(
                  'grid gap-1 rounded-lg border border-border p-3 text-sm',
                  testResult.status === 'success' && 'border-emerald-300'
                )}
              >
                <strong>{testResult.status}</strong>
                <span className="text-muted-foreground">{testResult.message}</span>
              </div>
            ) : null}
            {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
