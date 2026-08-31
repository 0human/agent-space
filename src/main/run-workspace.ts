import { cp, mkdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

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
  copyDirectory?: (source: string, destination: string) => Promise<void>
}

export function createRunWorkspaceManager(dependencies: RunWorkspaceManagerDependencies): RunWorkspaceManager {
  const createDirectory = dependencies.mkdir ?? (async (path, options) => {
    await mkdir(path, options)
  })
  const copyDirectory = dependencies.copyDirectory ?? (async (source, destination) => {
    const sourceGitMetadata = resolve(source, '.git')
    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (path) => resolve(path) !== sourceGitMetadata
    })
  })

  return {
    async prepare(project, runId): Promise<RunWorkspacePreparation> {
      const workspacePath = join(dirname(project.workspacePath), `${basename(project.workspacePath)}-agent-space-${runId}`)
      await createDirectory(dirname(workspacePath), { recursive: true })
      if (!project.head || project.isGreenfield) {
        await copyDirectory(project.workspacePath, workspacePath)
        const branch = `agent-space/${runId}`
        await dependencies.execGit(workspacePath, ['init'])
        await dependencies.execGit(workspacePath, ['checkout', '-b', branch])
        await dependencies.execGit(workspacePath, ['add', '--all'])
        await dependencies.execGit(workspacePath, ['-c', 'user.name=Agent Space', '-c', 'user.email=agent-space@local', 'commit', '--allow-empty', '-m', `Create base for ${runId}`])
        const baseCommit = (await dependencies.execGit(workspacePath, ['rev-parse', 'HEAD'])).trim() || null
        return { workspacePath, baseCommit, branch }
      }

      const branch = project.currentBranch ? `${project.currentBranch}/agent-space/${runId}` : `agent-space/${runId}`
      await dependencies.execGit(project.workspacePath, ['worktree', 'add', '-b', branch, workspacePath, project.head])
      return { workspacePath, baseCommit: project.head, branch }
    }
  }
}
