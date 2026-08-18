import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { Project } from '../shared/project'

export interface RunWorkspacePreparation {
  workspacePath: string
  baseCommit: string | null
  branch: string | null
}

export interface RunWorkspaceManager {
  prepare(project: Project, runId: string): Promise<RunWorkspacePreparation>
}

interface RunWorkspaceManagerDependencies {
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  mkdir?: (path: string, options: { recursive: true }) => Promise<void>
}

export function createRunWorkspaceManager(dependencies: RunWorkspaceManagerDependencies): RunWorkspaceManager {
  const createDirectory = dependencies.mkdir ?? (async (path, options) => {
    await mkdir(path, options)
  })

  return {
    async prepare(project, runId): Promise<RunWorkspacePreparation> {
      if (!project.head || project.isGreenfield) {
        return { workspacePath: project.workspacePath, baseCommit: project.head, branch: null }
      }

      const workspacePath = join(dirname(project.workspacePath), `${basename(project.workspacePath)}-agent-space-${runId}`)
      await createDirectory(dirname(workspacePath), { recursive: true })
      if (project.currentBranch) {
        const branch = `${project.currentBranch}/agent-space/${runId}`
        await dependencies.execGit(project.workspacePath, ['worktree', 'add', '-b', branch, workspacePath, project.head])
        return { workspacePath, baseCommit: project.head, branch }
      }
      await dependencies.execGit(project.workspacePath, ['worktree', 'add', '--detach', workspacePath, project.head])
      return { workspacePath, baseCommit: project.head, branch: null }
    }
  }
}
