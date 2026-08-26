import type { RuntimeAgentMessageItem, RuntimeCommandItem, RuntimeItem, RuntimeItemProjectionUpdate, RuntimeItemStatus } from '../shared/workflow-run'
import type { JsonRpcNotification } from './codex-app-server-transport'

export interface CodexItemProjectionScope {
  runId: string
  executionId: string
  threadId: string
  turnId: string
}

interface CodexItemProjectionDependencies {
  publish?: (update: RuntimeItemProjectionUpdate) => void | Promise<void>
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

export function createCodexItemProjection(dependencies: CodexItemProjectionDependencies = {}): CodexItemProjection {
  const itemsByExecution = new Map<string, Map<string, RuntimeItem>>()

  const update = (scope: CodexItemProjectionScope, item: RuntimeItem): void => {
    let executionItems = itemsByExecution.get(scope.executionId)
    if (!executionItems) {
      executionItems = new Map()
      itemsByExecution.set(scope.executionId, executionItems)
    }
    executionItems.set(item.id, item)

    try {
      const published = dependencies.publish?.({ runId: scope.runId, executionId: scope.executionId, item })
      if (published instanceof Promise) void published.catch(() => undefined)
    } catch {
      // Projection publication is observational and must not affect the active Turn.
    }
  }

  return {
    handle(notification, scope) {
      if (notification.params?.threadId !== scope.threadId || notification.params?.turnId !== scope.turnId) return

      if (notification.method === 'item/started' || notification.method === 'item/completed') {
        const item = record(notification.params.item)
        if (!item || typeof item.id !== 'string') return
        if (item.type === 'agentMessage' && typeof item.text === 'string') {
          update(scope, {
            id: item.id,
            runId: scope.runId,
            executionId: scope.executionId,
            type: 'agent_message',
            status: notification.method === 'item/completed' ? 'completed' : 'in_progress',
            text: item.text
          })
        } else if (item.type === 'commandExecution' && typeof item.command === 'string') {
          update(scope, {
            id: item.id,
            runId: scope.runId,
            executionId: scope.executionId,
            type: 'command',
            status: commandStatus(item.status),
            command: item.command,
            cwd: typeof item.cwd === 'string' ? item.cwd : null,
            output: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
            exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
          })
        }
        return
      }

      if (typeof notification.params.itemId !== 'string' || typeof notification.params.delta !== 'string') return
      const current = itemsByExecution.get(scope.executionId)?.get(notification.params.itemId)
      if (notification.method === 'item/agentMessage/delta' && current?.type === 'agent_message') {
        const item: RuntimeAgentMessageItem = { ...current, text: current.text + notification.params.delta }
        update(scope, item)
      } else if (notification.method === 'item/commandExecution/outputDelta' && current?.type === 'command') {
        const item: RuntimeCommandItem = { ...current, output: current.output + notification.params.delta }
        update(scope, item)
      }
    },
    list(executionId) {
      return [...(itemsByExecution.get(executionId)?.values() ?? [])]
    }
  }
}
