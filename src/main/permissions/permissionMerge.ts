import type {
  PermissionPolicyMergeStrategy,
  PermissionResolvePreview,
  PermissionRule
} from '../../shared/api'

export interface PermissionRuleSource {
  ownerType: string
  ownerId: string
  policySetId: string
  policySetName: string
  mergeStrategy: PermissionPolicyMergeStrategy
  priority: number
  rules: PermissionRule[]
}

const DECISION_RANK = {
  allow: 1,
  ask: 2,
  deny: 3
}

function ruleKey(rule: PermissionRule): string {
  return [rule.scope, rule.action, [...(rule.resources ?? ['*'])].sort().join(',')].join(':')
}

function stricterRule(current: PermissionRule, incoming: PermissionRule): PermissionRule {
  return DECISION_RANK[incoming.decision] >= DECISION_RANK[current.decision] ? incoming : current
}

function summarize(rules: PermissionRule[]): string {
  const denyCount = rules.filter((rule) => rule.decision === 'deny').length
  const askCount = rules.filter((rule) => rule.decision === 'ask').length
  const allowCount = rules.filter((rule) => rule.decision === 'allow').length

  return `${rules.length} effective rules: ${allowCount} allow, ${askCount} ask, ${denyCount} deny.`
}

export function mergePermissionRules(sources: PermissionRuleSource[]): PermissionResolvePreview {
  const orderedSources = [...sources].sort((left, right) => left.priority - right.priority)
  const effectiveRules = new Map<string, PermissionRule>()

  for (const source of orderedSources) {
    for (const rule of source.rules) {
      const key = ruleKey(rule)
      const existing = effectiveRules.get(key)

      if (!existing || source.mergeStrategy === 'additive') {
        effectiveRules.set(key, rule)
        continue
      }

      if (source.mergeStrategy === 'override') {
        effectiveRules.set(key, rule)
        continue
      }

      effectiveRules.set(key, stricterRule(existing, rule))
    }
  }

  const rules = [...effectiveRules.values()]

  return {
    summary: summarize(rules),
    effectiveRules: rules,
    sources: orderedSources.map((source) => ({
      ownerType: source.ownerType,
      ownerId: source.ownerId,
      policySetId: source.policySetId,
      policySetName: source.policySetName,
      mergeStrategy: source.mergeStrategy,
      priority: source.priority
    }))
  }
}
