import type {
  PermissionPolicyBindingInput,
  PermissionPolicyBindingSummary,
  PermissionPolicySetCreateInput,
  PermissionPolicySetDetail,
  PermissionPolicySetSummary,
  PermissionPolicySetUpdateInput,
  PermissionResolvePreview,
  PermissionResolvePreviewInput,
  PermissionRule
} from '../../shared/api'
import { createRepositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { PermissionPolicyBinding, PermissionPolicySet } from '../db/schema'
import { ValidationError } from '../runtime'
import { mergePermissionRules, type PermissionRuleSource } from './permissionMerge'
import { recommendedPolicySets } from './recommendedPolicies'
import {
  validateBindingInput,
  validatePolicySetCreateInput,
  validatePolicySetUpdateInput
} from './validation'

function parseRules(value: string): PermissionRule[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as PermissionRule[]) : []
  } catch {
    return []
  }
}

function stringifyRules(rules: PermissionRule[]): string {
  return JSON.stringify(rules)
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

export class PermissionService {
  constructor(private readonly db: AppDatabase) {}

  ensureRecommendedPolicySets(): void {
    const repositories = createRepositories(this.db)
    const existingNames = new Set(
      repositories.permissionPolicySets.list().map((policy) => policy.name)
    )

    for (const policy of recommendedPolicySets) {
      if (!existingNames.has(policy.name)) {
        this.createPolicySet(policy)
      }
    }
  }

  listPolicySets(): PermissionPolicySetSummary[] {
    return createRepositories(this.db).permissionPolicySets.list().map(this.toSummary)
  }

  getPolicySet(id: string): PermissionPolicySetDetail {
    const policy = createRepositories(this.db).permissionPolicySets.getById(id)
    if (!policy) {
      throw new ValidationError('Permission policy set not found.')
    }

    return this.toDetail(policy)
  }

  createPolicySet(input: PermissionPolicySetCreateInput): PermissionPolicySetDetail {
    const validated = validatePolicySetCreateInput(input)
    const policy = createRepositories(this.db).permissionPolicySets.create({
      name: validated.name,
      description: validated.description,
      preset: validated.preset,
      rulesJson: stringifyRules(validated.rules),
      enabled: validated.enabled ? 1 : 0
    })

    return this.toDetail(policy)
  }

  updatePolicySet(input: PermissionPolicySetUpdateInput): PermissionPolicySetDetail {
    const validated = validatePolicySetUpdateInput(input)
    const repositories = createRepositories(this.db)
    const policy = repositories.permissionPolicySets.update(validated.id, {
      name: validated.name,
      description: validated.description,
      preset: validated.preset,
      rulesJson: validated.rules === undefined ? undefined : stringifyRules(validated.rules),
      enabled: validated.enabled === undefined ? undefined : validated.enabled ? 1 : 0
    })

    if (!policy) {
      throw new ValidationError('Permission policy set not found.')
    }

    return this.toDetail(policy)
  }

  bindPolicySet(input: PermissionPolicyBindingInput): PermissionPolicyBindingSummary {
    const validated = validateBindingInput(input)
    const repositories = createRepositories(this.db)
    const policySet = repositories.permissionPolicySets.getById(validated.permissionPolicySetId)

    if (!policySet) {
      throw new ValidationError('Permission policy set not found.')
    }

    const binding = repositories.permissionPolicyBindings.create({
      ownerType: validated.ownerType,
      ownerId: validated.ownerId,
      permissionPolicySetId: validated.permissionPolicySetId,
      mergeStrategy: validated.mergeStrategy ?? 'additive',
      priority: validated.priority ?? 0,
      enabled: validated.enabled === false ? 0 : 1
    })

    return this.toBindingSummary(binding, policySet)
  }

  resolvePreview(input: PermissionResolvePreviewInput): PermissionResolvePreview {
    const repositories = createRepositories(this.db)
    const owners = [
      input.agentProfileId
        ? { ownerType: 'agent_profile', ownerId: input.agentProfileId }
        : undefined,
      input.runtimeConfigId
        ? { ownerType: 'runtime_config', ownerId: input.runtimeConfigId }
        : undefined,
      input.teamMemberId ? { ownerType: 'team_member', ownerId: input.teamMemberId } : undefined,
      input.projectId ? { ownerType: 'project', ownerId: input.projectId } : undefined,
      input.workSessionId ? { ownerType: 'work_session', ownerId: input.workSessionId } : undefined
    ].filter((owner): owner is { ownerType: string; ownerId: string } => Boolean(owner))

    const sources: PermissionRuleSource[] = owners.flatMap((owner, layerIndex) => {
      return repositories.permissionPolicyBindings
        .listByOwner(owner.ownerType, owner.ownerId)
        .flatMap((binding) => {
          const policy = repositories.permissionPolicySets.getById(binding.permissionPolicySetId)
          if (!policy || policy.enabled !== 1) {
            return []
          }

          return [
            {
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              policySetId: policy.id,
              policySetName: policy.name,
              mergeStrategy: binding.mergeStrategy as PermissionRuleSource['mergeStrategy'],
              priority: layerIndex * 1000 + binding.priority,
              rules: parseRules(policy.rulesJson)
            }
          ]
        })
    })

    return mergePermissionRules(sources)
  }

  private toSummary(policy: PermissionPolicySet): PermissionPolicySetSummary {
    return {
      id: policy.id,
      name: policy.name,
      description: optional(policy.description),
      preset: optional(policy.preset) as PermissionPolicySetSummary['preset'],
      enabled: policy.enabled === 1,
      lastUsedAt: optional(policy.lastUsedAt)
    }
  }

  private toDetail(policy: PermissionPolicySet): PermissionPolicySetDetail {
    return {
      ...this.toSummary(policy),
      rules: parseRules(policy.rulesJson),
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt
    }
  }

  private toBindingSummary(
    binding: PermissionPolicyBinding,
    policySet: PermissionPolicySet
  ): PermissionPolicyBindingSummary {
    return {
      id: binding.id,
      ownerType: binding.ownerType as PermissionPolicyBindingSummary['ownerType'],
      ownerId: binding.ownerId,
      permissionPolicySetId: binding.permissionPolicySetId,
      mergeStrategy: binding.mergeStrategy as PermissionPolicyBindingSummary['mergeStrategy'],
      priority: binding.priority,
      enabled: binding.enabled === 1,
      policySetName: policySet.name
    }
  }
}
