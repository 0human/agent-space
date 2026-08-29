import type { RuntimeItem } from '../../../../shared/workflow-run'

export interface RuntimeItemTimeline {
  items: RuntimeItem[]
  forExecution: (executionId: string) => RuntimeItem[]
}

export function mergeRuntimeItemTimeline(
  current: RuntimeItem[],
  incoming: RuntimeItem[],
): RuntimeItem[] {
  const positions = new Map(
    current.map((item, index) => [`${item.executionId}:${item.id}`, index]),
  )
  const next = [...current]

  for (const item of incoming) {
    const key = `${item.executionId}:${item.id}`
    const position = positions.get(key)
    if (position === undefined) {
      positions.set(key, next.length)
      next.push(item)
    } else {
      next[position] = item
    }
  }

  return next
}

export function createRuntimeItemTimeline(
  items: RuntimeItem[],
  runId: string,
): RuntimeItemTimeline {
  const runItems = items.filter((item) => item.runId === runId)
  return {
    items: runItems,
    forExecution: (executionId) =>
      runItems.filter((item) => item.executionId === executionId),
  }
}
