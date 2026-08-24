// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { Project } from '../shared/project'
import { createDefaultReleaseManager } from './release-manager'

const project: Project = {
  id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true, remote: null, currentBranch: 'main', head: 'abc', defaultBranch: 'main', isGreenfield: false,
  dirty: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-25T00:00:00.000Z'
}

describe('ReleaseManager Permission Policy boundary', () => {
  it('rejects commands, directories, and network destinations outside the Project policy', async () => {
    const manager = createDefaultReleaseManager()
    const result = await manager.preflight({
      project,
      workspacePath: '/work/demo',
      platform: 'linux',
      operation: 'release',
      step: { kind: 'tool', command: 'deploy', cwd: '../outside', targetEnvironment: 'https://deploy.example.com', requiredPermissions: ['network.deploy'] },
      input: {},
      permissionPolicy: {
        grantedPermissions: ['network.deploy'],
        allowedPaths: ['/work/demo'],
        allowedCommands: ['npm'],
        allowedNetworkHosts: ['staging.example.com']
      }
    })

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('cwd'),
      expect.stringContaining('command'),
      expect.stringContaining('网络')
    ]))
  })
})
