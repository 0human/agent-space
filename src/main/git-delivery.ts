import type { RuntimeArtifact } from '../shared/workflow-run'

export interface GitCommitRequest {
  workspacePath: string
  runId: string
  baseCommit: string | null
  ticket: string | null
}

export interface GitCommitResult {
  commit: string
  artifact: RuntimeArtifact
}

interface GitDeliveryDependencies {
  execGit: (workspacePath: string, args: string[]) => Promise<string>
}

function safeLabel(value: string | null): string {
  return (value ?? 'untracked').replace(/[\r\n]/g, ' ').trim() || 'untracked'
}

export function createGitDeliveryManager(dependencies: GitDeliveryDependencies) {
  return {
    async commitAfterReview(request: GitCommitRequest): Promise<GitCommitResult> {
      await dependencies.execGit(request.workspacePath, ['add', '-A'])
      try {
        await dependencies.execGit(request.workspacePath, [
          'commit', '-m', `agent-space: complete implementation for #${safeLabel(request.ticket)} (Run ${safeLabel(request.runId)}, base ${safeLabel(request.baseCommit)})`
        ])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/nothing to commit|working tree clean/i.test(message)) throw error
      }
      const commit = (await dependencies.execGit(request.workspacePath, ['rev-parse', 'HEAD'])).trim()
      if (!commit) throw new Error('Git commit 不可用：无法读取 HEAD。')
      return {
        commit,
        artifact: {
          type: 'commit',
          name: 'commit',
          runId: request.runId,
          location: `${request.workspacePath}@${commit}`,
          versionHash: commit,
          status: 'available'
        }
      }
    }
  }
}
