import { useEffect, useState } from 'react'

import type { Project } from '../../../../shared/project'
import type { RuntimeItem, WorkflowRun } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import type { AppPage } from '@renderer/app/navigation'

import { RunBoardView } from './RunBoardView'
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

  useEffect(() => {
    let disposed = false
    const refresh = async (): Promise<void> => {
      try {
        const current = await api.getWorkflowRun(run.id)
        if (!disposed && current) setRun(current)
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
      Promise.resolve().then(() => api.listRuntimeItems(execution.id)),
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
  ): Promise<void> => {
    try {
      setRun(await operation())
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <RunBoardView
      run={run}
      runtimeItems={runtimeItems}
      runtimeItemsUnavailable={runtimeItemsUnavailable}
      error={error}
      onBack={() => onNavigate({ name: 'projectDetail', project })}
      onPause={() => {
        void updateRun(() => api.pauseWorkflowRun(run.id))
      }}
      onResume={(guidance) => {
        void updateRun(() => api.resumeWorkflowRun(run.id, guidance))
      }}
      onRetry={(guidance) => {
        void updateRun(() => api.retryWorkflowStep(run.id, guidance))
      }}
      onCancel={() => {
        void updateRun(() => api.cancelWorkflowRun(run.id))
      }}
      onAnswer={(answer) => {
        void updateRun(() => api.answerWorkflowQuestion(run.id, answer))
      }}
      onApprove={() => {
        void updateRun(() => api.approveWorkflowApproval(run.id))
      }}
      onReject={() => {
        void updateRun(() => api.rejectWorkflowApproval(run.id))
      }}
    />
  )
}
