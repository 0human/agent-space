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

  useLayoutEffect(scrollToLive, [
    items,
    run.updatedAt,
    run.snapshot.currentStepExecutionId,
    scrollToLive,
  ])
  useLayoutEffect(() => {
    const observer = new ResizeObserver(scrollToLive)
    if (viewportRef.current) observer.observe(viewportRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [scrollToLive])

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
    },
    returnToLive: () => {
      liveRef.current = true
      setInspection(null)
      scrollToLive()
      viewportRef.current?.focus({ preventScroll: true })
    },
  }
}
