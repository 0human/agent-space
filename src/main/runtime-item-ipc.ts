import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { RuntimeItem } from '../shared/workflow-run'

interface RuntimeItemReader {
  list(executionId: string): RuntimeItem[]
}

interface RuntimeItemHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  projection: RuntimeItemReader
  loadHistory?: (runId: string, executionId: string) => Promise<void>
}

interface RuntimeItemWindow {
  webContents: {
    send(channel: string, item: RuntimeItem): void
  }
}

export function registerRuntimeItemHandlers({ handle, projection, loadHistory }: RuntimeItemHandlerDependencies): void {
  handle(APP_SHELL_CHANNELS.listRuntimeItems, async (_event: unknown, runId: unknown, executionId: unknown) => {
    if (typeof runId !== 'string' || !runId || typeof executionId !== 'string' || !executionId) return []
    await loadHistory?.(runId, executionId)
    return projection.list(executionId)
  })
}

export function publishRuntimeItemUpdate(windows: RuntimeItemWindow[], item: RuntimeItem): void {
  for (const window of windows) {
    try {
      window.webContents.send(APP_SHELL_CHANNELS.runtimeItemUpdated, item)
    } catch {
      // A closed or unavailable Renderer must not affect the active Turn.
    }
  }
}
