import type { AgentRuntimeAdapter, RuntimeEvent, RuntimeExecutionContext } from '../shared/workflow-run'
import { zhCNMain } from '../shared/i18n/zh-CN'

export function createFakeRuntimeAdapter(delayMs = 180): AgentRuntimeAdapter {
  const acknowledgedHumanSteps = new Set<string>()

  return {
    async execute(context: RuntimeExecutionContext): Promise<RuntimeEvent[]> {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const step = context.workflow.phases[context.phaseIndex]?.steps[context.stepIndex]
      if (!step) return [{ type: 'error', error: zhCNMain.workflowRun.fakeStepMissing }]

      if (context.idea.includes('[fail]') && context.execution.attempt === 1) {
        return [{ type: 'error', error: zhCNMain.workflowRun.fakeFailure }]
      }
      const alreadyBlocked = context.events.some((event) => event.type === 'blocked' && event.data.executionId === context.execution.id)
      if (context.idea.includes('[blocked]') && !alreadyBlocked) {
        return [{ type: 'status_changed', status: 'blocked' }]
      }
      if (step.kind === 'human' && !acknowledgedHumanSteps.has(context.execution.id)) {
        acknowledgedHumanSteps.add(context.execution.id)
        return [{ type: 'question', question: zhCNMain.workflowRun.fakeQuestion(step.name) }]
      }

      const events: RuntimeEvent[] = [{ type: 'status_changed', status: 'completed' }]
      for (const name of step.artifacts ?? []) events.push({ type: 'artifact_produced', artifact: {
        type: 'workflow-artifact',
        name,
        location: `${context.project.workspacePath}/.agent-space/artifacts/${context.runId}/${name}`
      } })
      return events
    }
  }
}
