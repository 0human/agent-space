import { appCopy } from '@renderer/app/copy'
import { projectCopy } from '@renderer/features/projects/copy'
import { settingsCopy } from '@renderer/features/settings/copy'
import { skillPackageCopy } from '@renderer/features/skill-packages/copy'
import { workflowRunCopy } from '@renderer/features/workflow-runs/copy'
import { workflowCopy } from '@renderer/features/workflows/copy'

export const zhCN = {
  ...appCopy,
  ...projectCopy,
  ...workflowCopy,
  ...workflowRunCopy,
  ...settingsCopy,
  ...skillPackageCopy,
} as const
