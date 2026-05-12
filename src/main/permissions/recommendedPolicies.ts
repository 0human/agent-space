import type { PermissionPolicySetCreateInput } from '../../shared/api'

export const recommendedPolicySets: PermissionPolicySetCreateInput[] = [
  {
    name: 'Project Read Only',
    description: 'Read project context and selected files without modifying the workspace.',
    preset: 'read_only',
    rules: [
      { scope: 'filesystem', action: 'read', decision: 'allow', resources: ['${projectRoot}/**'] },
      { scope: 'filesystem', action: 'write', decision: 'deny', resources: ['${projectRoot}/**'] },
      { scope: 'command', action: 'execute', decision: 'deny', resources: ['*'] }
    ]
  },
  {
    name: 'Project Safe Write',
    description: 'Allow normal project edits while asking before risky writes.',
    preset: 'project_write',
    rules: [
      { scope: 'filesystem', action: 'write', decision: 'allow', resources: ['${projectRoot}/**'] },
      { scope: 'filesystem', action: 'delete', decision: 'ask', resources: ['${projectRoot}/**'] }
    ]
  },
  {
    name: 'Command Approval',
    description: 'Require approval before shell command execution.',
    preset: 'command_approval',
    rules: [{ scope: 'command', action: 'execute', decision: 'ask', resources: ['*'] }]
  },
  {
    name: 'Git Safe',
    description: 'Allow read-only git commands and ask before mutations.',
    rules: [
      {
        scope: 'command',
        action: 'execute',
        decision: 'allow',
        resources: ['git status', 'git diff']
      },
      {
        scope: 'command',
        action: 'execute',
        decision: 'ask',
        resources: ['git commit', 'git push']
      },
      { scope: 'command', action: 'execute', decision: 'deny', resources: ['git reset --hard'] }
    ]
  },
  {
    name: 'Network Restricted',
    description: 'Deny external network by default.',
    rules: [{ scope: 'network', action: 'request', decision: 'deny', resources: ['*'] }]
  },
  {
    name: 'Env Minimal',
    description: 'Only allow explicitly whitelisted environment access.',
    rules: [{ scope: 'environment', action: 'read', decision: 'deny', resources: ['*'] }]
  },
  {
    name: 'Full Access',
    description: 'Allow broad workspace, command, and network access.',
    preset: 'full_access',
    rules: [
      { scope: 'filesystem', action: 'write', decision: 'allow', resources: ['*'] },
      { scope: 'command', action: 'execute', decision: 'allow', resources: ['*'] },
      { scope: 'network', action: 'request', decision: 'allow', resources: ['*'] }
    ]
  }
]
