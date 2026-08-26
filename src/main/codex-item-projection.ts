import type { PermissionPolicy } from '../shared/project'
import type { RuntimeAgentMessageItem, RuntimeCommandItem, RuntimeErrorItem, RuntimeFileChange, RuntimeItem, RuntimeItemStatus, RuntimeLocator } from '../shared/workflow-run'
import type { JsonRpcNotification } from './codex-app-server-transport'

export interface CodexItemProjectionScope {
  runId: string
  executionId: string
  runtimeLocator: RuntimeLocator
  permissionPolicy: PermissionPolicy
  source: string
}

interface CodexItemProjectionDependencies {
  publish?: (item: RuntimeItem) => void | Promise<void>
}

export interface CodexItemProjection {
  handle(notification: JsonRpcNotification, scope: CodexItemProjectionScope): void
  list(executionId: string): RuntimeItem[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function commandStatus(value: unknown): RuntimeItemStatus {
  if (value === 'completed' || value === 'failed' || value === 'declined') return value
  return 'in_progress'
}

function sanitize(value: string): string {
  return value
    .replace(/(https?:\/\/)([^/@\s]+)@/gi, '$1<redacted>@')
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<redacted>')
    .replace(/((?:token|secret|password|authorization)[=:]\s*)[^\s,;]+/gi, '$1<redacted>')
    .replace(/((?:[A-Za-z0-9]+_)*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIALS?|AUTHORIZATION)(?:_[A-Za-z0-9]+)*\s*[=:]\s*)[^\s,;]+/g, '$1<redacted>')
    .replace(/((?:AWS|GITHUB|OPENAI|AZURE|GOOGLE|DATABASE|DB|NPM|NODE|HOME|PATH|PWD|USER|SHELL|CI)[A-Za-z0-9_]*\s*[=:]\s*)[^\s,;]+/g, '$1<redacted>')
}

function lineCounts(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function fileChanges(value: unknown): RuntimeFileChange[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const change = record(entry)
    const path = typeof change?.path === 'string' ? change.path : null
    const diff = typeof change?.diff === 'string' ? change.diff : ''
    const kindValue = typeof change?.kind === 'string' ? change.kind : record(change?.kind)?.type
    if (!path || !['add', 'update', 'delete'].includes(String(kindValue))) return []
    const counts = lineCounts(diff)
    const safePath = /(?:^|[\\/])(?:\.env(?:\.|$)|[^\\/]*(?:secret|credential|token|password)[^\\/]*)$/i.test(path) ? '<redacted path>' : path
    return [{ path: safePath, kind: kindValue as RuntimeFileChange['kind'], ...counts }]
  })
}

function toolOutput(item: Record<string, unknown>): string | null {
  const error = record(item.error)
  if (typeof error?.message === 'string') return sanitize(error.message)
  const result = record(item.result)
  const content = result?.content
  if (!Array.isArray(content)) return null
  const text = content.flatMap((entry) => {
    const value = record(entry)?.text
    return typeof value === 'string' ? [sanitize(value)] : []
  }).join('\n')
  return text || null
}

function planSteps(value: unknown): Array<{ step: string; status: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const plan = record(entry)
    const step = typeof plan?.step === 'string' ? plan.step : typeof plan?.name === 'string' ? plan.name : null
    const status = typeof plan?.status === 'string' ? plan.status : null
    return step && status ? [{ step: sanitize(step), status: sanitize(status) }] : []
  })
}

export function createCodexItemProjection(dependencies: CodexItemProjectionDependencies = {}): CodexItemProjection {
  const itemsByExecution = new Map<string, Map<string, RuntimeItem>>()
  const seenNotifications = new WeakSet<object>()

  const update = (scope: CodexItemProjectionScope, item: RuntimeItem): void => {
    let executionItems = itemsByExecution.get(scope.executionId)
    if (!executionItems) {
      executionItems = new Map()
      itemsByExecution.set(scope.executionId, executionItems)
    }
    const previous = executionItems.get(item.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(item)) return
    executionItems.set(item.id, item)

    try {
      const published = dependencies.publish?.(item)
      if (published instanceof Promise) void published.catch(() => undefined)
    } catch {
      // Projection publication is observational and must not affect the active Turn.
    }
  }

  return {
    handle(notification, scope) {
      if (notification.params?.threadId !== scope.runtimeLocator.threadId || notification.params?.turnId !== scope.runtimeLocator.turnId) return
      if (seenNotifications.has(notification)) return
      seenNotifications.add(notification)

      const metadata = {
        runId: scope.runId,
        executionId: scope.executionId,
        provider: scope.runtimeLocator.runtimeProvider,
        source: scope.source,
        permissionPolicy: scope.permissionPolicy,
        runtimeLocator: scope.runtimeLocator
      }

      if (notification.method === 'item/started' || notification.method === 'item/completed') {
        const item = record(notification.params.item)
        if (!item || typeof item.id !== 'string') return
        if (item.type === 'agentMessage' && typeof item.text === 'string') {
          update(scope, {
            id: item.id,
            ...metadata,
            type: 'agent_message',
            status: notification.method === 'item/completed' ? 'completed' : 'in_progress',
            text: sanitize(item.text)
          })
        } else if (item.type === 'commandExecution' && typeof item.command === 'string') {
          update(scope, {
            id: item.id,
            ...metadata,
            type: 'command',
            status: notification.method === 'item/completed' && item.status === undefined ? 'completed' : commandStatus(item.status),
            command: sanitize(item.command),
            output: typeof item.aggregatedOutput === 'string' ? sanitize(item.aggregatedOutput) : '',
            exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
          })
        } else if (item.type === 'fileChange') {
          const changes = fileChanges(item.changes)
          update(scope, {
            id: item.id,
            ...metadata,
            type: 'file_change',
            status: notification.method === 'item/completed' && item.status === undefined ? 'completed' : commandStatus(item.status),
            changes,
            additions: changes.reduce((total, change) => total + change.additions, 0),
            deletions: changes.reduce((total, change) => total + change.deletions, 0)
          })
        } else if (item.type === 'plan') {
          const steps = planSteps(item.plan)
          update(scope, {
            id: item.id,
            ...metadata,
            type: 'plan',
            status: notification.method === 'item/completed' && item.status === undefined ? 'completed' : commandStatus(item.status),
            text: typeof item.text === 'string' ? sanitize(item.text) : '',
            ...(steps.length > 0 ? { steps } : {})
          })
        } else if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
          const name = item.type === 'mcpToolCall'
            ? (typeof item.server === 'string' && typeof item.tool === 'string' ? `${item.server}.${item.tool}` : null)
            : (typeof item.tool === 'string' ? `${typeof item.namespace === 'string' && item.namespace ? `${item.namespace}.` : ''}${item.tool}` : null)
          if (!name) return
          update(scope, {
            id: item.id,
            ...metadata,
            type: 'tool',
            name: sanitize(name),
            status: notification.method === 'item/completed' && item.status === undefined ? 'completed' : commandStatus(item.status),
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
            output: toolOutput(item)
          })
        }
        return
      }

      if (notification.method === 'error') {
        const error = record(notification.params.error)
        const message = typeof error?.message === 'string' ? error.message : typeof notification.params.message === 'string' ? notification.params.message : null
        if (!message) return
        const item: RuntimeErrorItem = { id: `error:${scope.runtimeLocator.turnId}:${notification.params.code ?? 'unknown'}`, ...metadata, type: 'error', status: 'failed', error: sanitize(message) }
        update(scope, item)
        return
      }

      if (typeof notification.params.itemId !== 'string' || typeof notification.params.delta !== 'string') return
      const current = itemsByExecution.get(scope.executionId)?.get(notification.params.itemId)
      if (notification.method === 'item/agentMessage/delta' && current?.type === 'agent_message') {
        const item: RuntimeAgentMessageItem = { ...current, text: current.text + sanitize(notification.params.delta) }
        update(scope, item)
      } else if (notification.method === 'item/commandExecution/outputDelta' && current?.type === 'command') {
        const item: RuntimeCommandItem = { ...current, output: current.output + sanitize(notification.params.delta) }
        update(scope, item)
      }
    },
    list(executionId) {
      return [...(itemsByExecution.get(executionId)?.values() ?? [])]
    }
  }
}
