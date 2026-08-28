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
    void Promise.all(
      run.stepExecutions.map((execution) => api.listRuntimeItems(execution.id)),
    )
      .then((snapshots) => {
        if (!disposed)
          setRuntimeItems((current) =>
            mergeRuntimeItemTimeline(current, snapshots.flat()),
          )
      })
      .catch(() => undefined)
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
      error={error}
      onBack={() => onNavigate({ name: 'projectDetail', project })}
      onPause={() => {
        void updateRun(() => api.pauseWorkflowRun(run.id))
      }}
      onResume={() => {
        void updateRun(() => api.resumeWorkflowRun(run.id))
      }}
      onRetry={() => {
        void updateRun(() => api.retryWorkflowStep(run.id))
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
