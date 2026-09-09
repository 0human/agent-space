import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import {
  runtimeItemIdentity,
  type RuntimeItem,
  type WorkflowRun,
} from '../../../../shared/workflow-run'

function activityVersions(
  run: WorkflowRun,
  items: RuntimeItem[],
): Map<string, string> {
  const executions = new Set(
    run.stepExecutions.map((execution) => execution.id),
  )
  return new Map([
    ...run.stepExecutions.map((execution): [string, string] => [
      `execution:${execution.id}`,
      execution.status,
    ]),
    ...items
      .filter(
        (item) => item.runId === run.id && executions.has(item.executionId),
      )
      .map((item): [string, string] => [
        `${item.executionId}:${runtimeItemIdentity(item)}`,
        JSON.stringify(item),
      ]),
  ])
}

export function useRunActivityScroll(run: WorkflowRun, items: RuntimeItem[]) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const targets = useRef(new Map<string, HTMLElement>())
  const liveRef = useRef(true)
  const readingAnchor = useRef<{ element: HTMLElement; offset: number } | null>(null)
  const [inspection, setInspection] = useState<{
    target: string | null
    baseline: Map<string, string>
  } | null>(null)
  const versions = activityVersions(run, items)
  const newActivityCount = inspection
    ? [...versions].filter(
        ([key, version]) => inspection.baseline.get(key) !== version,
      ).length
    : 0

  const scrollToLive = useCallback(() => {
    const viewport = viewportRef.current
    if (viewport && liveRef.current)
      viewport.scrollTop = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight,
      )
  }, [])

  const rememberReadingPosition = (): void => {
    const viewport = viewportRef.current
    if (!viewport) return
    const bounds = viewport.getBoundingClientRect()
    const element = [...(contentRef.current?.querySelectorAll<HTMLElement>('h2, h3, article') ?? [])]
      .find((entry) => {
        const rect = entry.getBoundingClientRect()
        return rect.bottom > bounds.top && rect.top < bounds.bottom
      })
    readingAnchor.current = element
      ? { element, offset: element.getBoundingClientRect().top - bounds.top }
      : null
  }

  const restoreReadingPosition = useCallback(() => {
    if (liveRef.current) {
      scrollToLive()
      return
    }
    const viewport = viewportRef.current
    const anchor = readingAnchor.current
    if (viewport && anchor?.element.isConnected) {
      viewport.scrollTop += anchor.element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top - anchor.offset
    }
  }, [scrollToLive])

  useLayoutEffect(restoreReadingPosition, [
    items,
    run.updatedAt,
    run.snapshot.currentStepExecutionId,
    restoreReadingPosition,
  ])
  useLayoutEffect(() => {
    const observer = new ResizeObserver(restoreReadingPosition)
    if (viewportRef.current) observer.observe(viewportRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [restoreReadingPosition])

  const inspect = (target: string | null): void => {
    liveRef.current = false
    setInspection((current) => ({
      target,
      baseline: current?.baseline ?? versions,
    }))
    const element = target ? targets.current.get(target) : null
    const viewport = viewportRef.current
    if (element && viewport) {
      viewport.scrollTop +=
        element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top
      element.focus({ preventScroll: true })
    }
    rememberReadingPosition()
  }

  return {
    viewportRef,
    contentRef,
    targets,
    inspection,
    newActivityCount,
    inspect,
    onScroll: () => {
      const viewport = viewportRef.current
      if (
        liveRef.current &&
        viewport &&
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 48
      )
        inspect(null)
      else if (!liveRef.current)
        rememberReadingPosition()
    },
    returnToLive: () => {
      liveRef.current = true
      readingAnchor.current = null
      setInspection(null)
      scrollToLive()
      viewportRef.current?.focus({ preventScroll: true })
    },
  }
}
