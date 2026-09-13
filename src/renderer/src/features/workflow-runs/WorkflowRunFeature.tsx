import { useEffect, useRef, useState } from 'react'

import type { Project } from '../../../../shared/project'
import type { RuntimeItem, WorkflowRun } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import type { AppPage } from '@renderer/app/navigation'

import { RunActivityView } from './RunActivityView'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { mergeRuntimeItemTimeline } from './runtime-item-timeline'

export function WorkflowRunFeature({
  project,
  initialRun,
  onNavigate,
}: {
  project: Project
  initialRun: WorkflowRun
  onNavigate: (page: AppPage) => void
}): React.JSX.Element {
  const api = useAppShell()
  const [run, setRun] = useState(initialRun)
  const [runtimeItems, setRuntimeItems] = useState<RuntimeItem[]>([])
  const [runtimeItemsUnavailable, setRuntimeItemsUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revision = useRef(0)

  useEffect(() => {
    let disposed = false
    let latestRequest = 0
    const refresh = async (): Promise<void> => {
      const request = ++latestRequest
      try {
        const requestRevision = revision.current
        const current = await api.getWorkflowRun(run.id)
        if (!disposed && current && requestRevision === revision.current && request === latestRequest) setRun(current)
      } catch {
        // Polling retains the most recent durable projection.
      }
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, 500)
    void refresh()
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [api, run.id])

  useEffect(() => {
    let disposed = false
    const snapshotRequests = run.stepExecutions.map((execution) =>
      Promise.resolve().then(() => api.listRuntimeItems(run.id, execution.id)),
    )
    void Promise.allSettled(snapshotRequests).then((results) => {
      if (disposed) return
      const snapshots = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      )
      setRuntimeItems((current) =>
        mergeRuntimeItemTimeline(current, snapshots),
      )
      setRuntimeItemsUnavailable(
        results.some((result) => result.status === 'rejected'),
      )
    })
    return () => {
      disposed = true
    }
  }, [api, run.id, run.stepExecutions.length])

  useEffect(() => {
    try {
      return api.subscribeRuntimeItemUpdates((item) => {
        if (item.runId === run.id)
          setRuntimeItems((current) =>
            mergeRuntimeItemTimeline(current, [item]),
          )
      })
    } catch {
      return undefined
    }
  }, [api, run.id])

  const updateRun = async (
    operation: () => Promise<WorkflowRun>,
  ): Promise<boolean> => {
    revision.current += 1
    try {
      setRun(await operation())
      revision.current += 1
      setError(null)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }

  return (
    <RunActivityView
      key={run.id}
      run={run}
      runtimeItems={runtimeItems}
      runtimeItemsUnavailable={runtimeItemsUnavailable}
      error={error}
      onOpenInIde={() => {
        void api.openWorkflowRunInIde(run.id).then((result) => {
          setError(result.ok ? null : result.error ?? copy.run.openInIdeError)
        }).catch(() => setError(copy.run.openInIdeError))
      }}
      onBack={() => onNavigate({ name: 'projectDetail', project })}
      onPause={() => updateRun(() => api.pauseWorkflowRun(run.id))}
      onResume={(guidance) => updateRun(() => api.resumeWorkflowRun(run.id, guidance))}
      onRetry={(guidance) => updateRun(() => api.retryWorkflowStep(run.id, guidance))}
      onCancel={() => updateRun(() => api.cancelWorkflowRun(run.id))}
      onAnswer={(answer) => updateRun(() => api.answerWorkflowQuestion(run.id, answer))}
      onApprove={() => updateRun(() => api.approveWorkflowApproval(run.id))}
      onReject={() => updateRun(() => api.rejectWorkflowApproval(run.id))}
    />
  )
}
