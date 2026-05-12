import type {
  AgentProfileCreateInput,
  AgentProfileDetail,
  AgentProfileSummary,
  AgentProfileUpdateInput
} from '../../shared/api'
import { createRepositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { AgentProfile } from '../db/schema'
import { PermissionService } from '../permissions/permissionService'
import { ValidationError } from '../runtime'
import { validateAgentProfileCreateInput, validateAgentProfileUpdateInput } from './validation'

function parseArray(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

export class AgentProfileService {
  constructor(
    private readonly db: AppDatabase,
    private readonly _permissionService: PermissionService
  ) {}

  list(): AgentProfileSummary[] {
    return createRepositories(this.db).agentProfiles.list().map(this.toSummary)
  }

  get(id: string): AgentProfileDetail {
    const profile = createRepositories(this.db).agentProfiles.getById(id)

    if (!profile) {
      throw new ValidationError('Agent Profile not found.')
    }

    return this.toDetail(profile)
  }

  create(input: AgentProfileCreateInput): AgentProfileDetail {
    const validated = validateAgentProfileCreateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const profile = repositories.agentProfiles.create({
        name: validated.name,
        description: validated.description,
        permissionPreset: validated.permissionPreset,
        baseSystemPrompt: validated.baseSystemPrompt,
        rolePromptTemplate: validated.rolePromptTemplate,
        defaultArgsJson: JSON.stringify(validated.defaultArgs ?? []),
        defaultCwdMode: validated.defaultCwdMode ?? 'project_root',
        customCwd: validated.customCwd,
        outputStyle: validated.outputStyle,
        approvalMode: validated.approvalMode,
        envWhitelistJson: JSON.stringify(validated.envWhitelist ?? [])
      })

      for (const policySetId of validated.permissionPolicySetIds ?? []) {
        const policySet = repositories.permissionPolicySets.getById(policySetId)
        if (!policySet) {
          throw new ValidationError('Permission policy set not found.')
        }

        repositories.permissionPolicyBindings.create({
          ownerType: 'agent_profile',
          ownerId: profile.id,
          permissionPolicySetId: policySetId,
          mergeStrategy: 'additive',
          priority: 0,
          enabled: 1
        })
      }

      return this.toDetail(profile)
    })
  }

  update(input: AgentProfileUpdateInput): AgentProfileDetail {
    const validated = validateAgentProfileUpdateInput(input)
    const repositories = createRepositories(this.db)
    const profile = repositories.agentProfiles.update(validated.id, {
      name: validated.name,
      description: validated.description,
      permissionPreset: validated.permissionPreset,
      baseSystemPrompt: validated.baseSystemPrompt,
      rolePromptTemplate: validated.rolePromptTemplate,
      defaultArgsJson:
        validated.defaultArgs === undefined ? undefined : JSON.stringify(validated.defaultArgs),
      defaultCwdMode: validated.defaultCwdMode,
      customCwd: validated.customCwd,
      outputStyle: validated.outputStyle,
      approvalMode: validated.approvalMode,
      envWhitelistJson:
        validated.envWhitelist === undefined ? undefined : JSON.stringify(validated.envWhitelist)
    })

    if (!profile) {
      throw new ValidationError('Agent Profile not found.')
    }

    return this.toDetail(profile)
  }

  private toSummary(profile: AgentProfile): AgentProfileSummary {
    return {
      id: profile.id,
      name: profile.name,
      description: optional(profile.description),
      permissionPreset: optional(
        profile.permissionPreset
      ) as AgentProfileSummary['permissionPreset'],
      outputStyle: optional(profile.outputStyle) as AgentProfileSummary['outputStyle'],
      approvalMode: optional(profile.approvalMode) as AgentProfileSummary['approvalMode'],
      lastUsedAt: optional(profile.lastUsedAt)
    }
  }

  private toDetail(profile: AgentProfile): AgentProfileDetail {
    return {
      ...this.toSummary(profile),
      baseSystemPrompt: optional(profile.baseSystemPrompt),
      rolePromptTemplate: optional(profile.rolePromptTemplate),
      defaultArgs: parseArray(profile.defaultArgsJson),
      defaultCwdMode: profile.defaultCwdMode as AgentProfileDetail['defaultCwdMode'],
      customCwd: optional(profile.customCwd),
      envWhitelist: parseArray(profile.envWhitelistJson),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }
  }
}
