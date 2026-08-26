import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { RuntimeItem, RuntimeItemProjectionUpdate } from '../shared/workflow-run'

interface RuntimeItemReader {
  list(executionId: string): RuntimeItem[]
}

interface RuntimeItemHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  projection: RuntimeItemReader
}

interface RuntimeItemWindow {
  webContents: {
    send(channel: string, update: RuntimeItemProjectionUpdate): void
  }
}

export function registerRuntimeItemHandlers({ handle, projection }: RuntimeItemHandlerDependencies): void {
  handle(APP_SHELL_CHANNELS.listRuntimeItems, async (_event: unknown, executionId: unknown) => {
    return typeof executionId === 'string' && executionId ? projection.list(executionId) : []
  })
}

export function publishRuntimeItemUpdate(windows: RuntimeItemWindow[], update: RuntimeItemProjectionUpdate): void {
  for (const window of windows) {
    try {
      window.webContents.send(APP_SHELL_CHANNELS.runtimeItemUpdated, update)
    } catch {
      // A closed or unavailable Renderer must not affect the active Turn.
    }
  }
}
