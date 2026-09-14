import { useEffect, useState } from 'react'

import type { WorkflowRun } from '../../../../shared/workflow-run'
import { useAppShell } from '@renderer/app/app-shell-provider'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function useProjectRun(projectId: string | null): {
  run: WorkflowRun | null
  loading: boolean
  error: string | null
} {
  const api = useAppShell()
  const [state, setState] = useState<{
    projectId: string | null
    run: WorkflowRun | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!projectId) return
    let disposed = false
    let pending = false
    const refresh = async (): Promise<void> => {
      if (pending) return
      pending = true
      try {
        const run = await api.getProjectWorkflowRun(projectId)
        if (!disposed) setState({ projectId, run, error: null })
      } catch {
        if (!disposed) setState((current) => ({
          projectId,
          run: current?.projectId === projectId ? current.run : null,
          error: copy.run.loadError,
        }))
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 500)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [api, projectId])

  if (!projectId || state?.projectId !== projectId) return { run: null, loading: Boolean(projectId), error: null }
  return { run: state.run, loading: false, error: state.error }
}
