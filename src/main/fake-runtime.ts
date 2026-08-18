import type { AgentRuntimeAdapter, RuntimeExecutionContext, RuntimeResult } from '../shared/workflow-run'

export function createFakeRuntimeAdapter(delayMs = 180): AgentRuntimeAdapter {
  const acknowledgedHumanSteps = new Set<string>()
  const releasedBlocks = new Set<string>()

  return {
    async execute(context: RuntimeExecutionContext): Promise<RuntimeResult> {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const step = context.workflow.phases[context.phaseIndex]?.steps[context.stepIndex]
      if (!step) return { type: 'failed', error: 'Workflow Step 不存在。' }

      if (context.idea.includes('[fail]') && context.execution.attempt === 1) {
        return { type: 'failed', error: 'fake Runtime 模拟失败。' }
      }
      if (context.idea.includes('[blocked]') && !releasedBlocks.has(context.execution.id)) {
        releasedBlocks.add(context.execution.id)
        return { type: 'blocked', reason: 'fake Runtime 模拟 blocked。' }
      }
      if (step.kind === 'human' && !acknowledgedHumanSteps.has(context.execution.id)) {
        acknowledgedHumanSteps.add(context.execution.id)
        return { type: 'waiting', question: `请确认：${step.name}` }
      }

      return {
        type: 'completed',
        output: { runtime: 'fake', step: step.id },
        artifacts: (step.artifacts ?? []).map((name) => ({
          type: 'workflow-artifact',
          name,
          location: `${context.project.workspacePath}/.agent-space/artifacts/${context.runId}/${name}`
        }))
      }
    }
  }
}
