import type {
  TeamCreateInput,
  TeamDetail,
  TeamMemberDetail,
  TeamSummary,
  TeamUpdateInput
} from '../../shared/api'
import { createRepositories, type Repositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { AiTeam, AiTeamMember } from '../db/schema'
import { ValidationError } from '../runtime'
import { validateTeamCreateInput, validateTeamUpdateInput } from './validation'

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

export class TeamService {
  constructor(private readonly db: AppDatabase) {}

  list(): TeamSummary[] {
    const repositories = createRepositories(this.db)
    return repositories.teams.list().map((team) => ({
      id: team.id,
      name: team.name,
      goal: optional(team.goal),
      memberCount: repositories.teamMembers.listByTeam(team.id).length,
      lastUsedAt: optional(team.lastUsedAt)
    }))
  }

  get(id: string): TeamDetail {
    const repositories = createRepositories(this.db)
    const team = repositories.teams.getById(id)
    if (!team) {
      throw new ValidationError('Team not found.')
    }

    return this.toDetail(team, repositories.teamMembers.listByTeam(id), repositories)
  }

  create(input: TeamCreateInput): TeamDetail {
    const validated = validateTeamCreateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const team = repositories.teams.create({
        name: validated.name,
        goal: validated.goal,
        description: validated.description,
        defaultLaunchMode: validated.defaultLaunchMode
      })

      for (const member of validated.members ?? []) {
        const runtime = repositories.runtimes.getById(member.runtimeConfigId)
        if (!runtime) {
          throw new ValidationError('Runtime not found for Team member.')
        }

        const createdMember = repositories.teamMembers.create({
          teamId: team.id,
          name: member.name,
          role: member.role,
          runtimeConfigId: member.runtimeConfigId,
          agentProfileId: member.agentProfileId,
          taskInstruction: member.taskInstruction,
          enabled: member.enabled === false ? 0 : 1,
          sortOrder: member.sortOrder ?? 0
        })

        for (const policySetId of member.permissionPolicySetIds ?? []) {
          repositories.permissionPolicyBindings.create({
            ownerType: 'team_member',
            ownerId: createdMember.id,
            permissionPolicySetId: policySetId,
            mergeStrategy: 'additive',
            priority: 0,
            enabled: 1
          })
        }
      }

      return this.toDetail(team, repositories.teamMembers.listByTeam(team.id), repositories)
    })
  }

  update(input: TeamUpdateInput): TeamDetail {
    const validated = validateTeamUpdateInput(input)
    const repositories = createRepositories(this.db)
    const team = repositories.teams.update(validated.id, {
      name: validated.name,
      goal: validated.goal,
      description: validated.description,
      defaultLaunchMode: validated.defaultLaunchMode
    })

    if (!team) {
      throw new ValidationError('Team not found.')
    }

    return this.toDetail(team, repositories.teamMembers.listByTeam(team.id), repositories)
  }

  private toDetail(team: AiTeam, members: AiTeamMember[], repositories: Repositories): TeamDetail {
    return {
      id: team.id,
      name: team.name,
      goal: optional(team.goal),
      memberCount: members.length,
      lastUsedAt: optional(team.lastUsedAt),
      description: optional(team.description),
      defaultLaunchMode: optional(team.defaultLaunchMode) as TeamDetail['defaultLaunchMode'],
      members: members.map((member) => this.toMemberDetail(member, repositories)),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    }
  }

  private toMemberDetail(member: AiTeamMember, repositories: Repositories): TeamMemberDetail {
    const runtime = repositories.runtimes.getById(member.runtimeConfigId)
    if (!runtime) {
      throw new ValidationError('Runtime not found for Team member.')
    }

    return {
      id: member.id,
      name: member.name,
      role: member.role as TeamMemberDetail['role'],
      runtimeConfigId: member.runtimeConfigId,
      runtimeName: runtime.name,
      runtimeProvider: runtime.provider as TeamMemberDetail['runtimeProvider'],
      agentProfileId: optional(member.agentProfileId),
      taskInstruction: optional(member.taskInstruction),
      enabled: member.enabled === 1,
      sortOrder: member.sortOrder,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt
    }
  }
}
