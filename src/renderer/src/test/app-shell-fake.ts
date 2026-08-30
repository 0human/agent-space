import { vi } from 'vitest'

import type { AppShellApi } from '../../../shared/app-shell'
import {
  BUILT_IN_DEVELOPMENT_WORKFLOW,
  BUILT_IN_SKILL_MANIFESTS,
} from '../../../shared/workflow'

export function createAppShellApi(): AppShellApi {
  return {
    getRuntimeInfo: vi
      .fn()
      .mockResolvedValue({ platform: 'darwin', version: '0.1.0' }),
    listProjects: vi.fn().mockResolvedValue([]),
    importProject: vi.fn().mockResolvedValue(null),
    cloneGitHubProject: vi.fn().mockResolvedValue(null),
    deleteProject: vi.fn().mockResolvedValue({ ok: true, status: 'deleted', project: null, error: null }),
    openProjectInIde: vi.fn().mockResolvedValue({ ok: true, error: null }),
    getWorkflow: vi.fn().mockResolvedValue({
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      source: 'built-in',
      path: null,
      validation: { valid: true, errors: [], warnings: [] },
      canStart: true,
      skillManifests: BUILT_IN_SKILL_MANIFESTS,
    }),
    copyWorkflow: vi.fn(),
    reloadWorkflow: vi.fn(),
    preflightWorkflowRun: vi.fn(),
    startWorkflowRun: vi.fn(),
    listWorkflowRuns: vi.fn().mockResolvedValue([]),
    getWorkflowRun: vi.fn(),
    listRuntimeItems: vi.fn().mockResolvedValue([]),
    subscribeRuntimeItemUpdates: vi.fn().mockReturnValue(() => undefined),
    pauseWorkflowRun: vi.fn(),
    resumeWorkflowRun: vi.fn(),
    retryWorkflowStep: vi.fn(),
    cancelWorkflowRun: vi.fn(),
    answerWorkflowQuestion: vi.fn(),
    approveWorkflowApproval: vi.fn(),
    rejectWorkflowApproval: vi.fn(),
    openWorkflowFile: vi.fn().mockResolvedValue({ ok: true, error: null }),
    previewSkillInstall: vi.fn(),
    installSkill: vi.fn(),
    listInstalledSkills: vi.fn().mockResolvedValue([]),
  }
}
