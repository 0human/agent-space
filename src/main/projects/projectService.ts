import type {
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectCreateResult,
  ProjectDetail,
  ProjectListInput,
  ProjectMetrics,
  ProjectSummary,
  ProjectUpdateInput
} from '../../shared/api'
import { createRepositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { Project, ProjectMetricSnapshot } from '../db/schema'
import { ValidationError } from '../runtime'
import { validateProjectCreateInput, validateProjectUpdateInput } from './validation'

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

function now(): string {
  return new Date().toISOString()
}

export class ProjectService {
  constructor(private readonly db: AppDatabase) {}

  list(input: ProjectListInput = {}): ProjectSummary[] {
    const repositories = createRepositories(this.db)
    return repositories.projects
      .list()
      .filter((project) => (input.archived ? Boolean(project.archivedAt) : !project.archivedAt))
      .filter((project) => (input.phase ? project.phase === input.phase : true))
      .filter((project) => (input.riskStatus ? project.riskStatus === input.riskStatus : true))
      .map((project) =>
        this.toSummary(project, repositories.projectMetricSnapshots.latestByProject(project.id))
      )
  }

  get(id: string): ProjectDetail {
    const repositories = createRepositories(this.db)
    const project = repositories.projects.getById(id)
    if (!project) {
      throw new ValidationError('Project not found.')
    }

    return this.toDetail(project, repositories.projectMetricSnapshots.latestByProject(project.id))
  }

  create(input: ProjectCreateInput): ProjectCreateResult {
    const validated = validateProjectCreateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      this.assertReferences(validated, repositories)
      const createdAt = now()
      const project = repositories.projects.create({
        name: validated.name,
        description: validated.description,
        localPath: validated.localPath,
        phase: validated.phase ?? 'requirements',
        defaultAiTeamId: validated.defaultAiTeamId,
        defaultAiRuntimeConfigId: validated.defaultAiRuntimeConfigId,
        defaultAgentProfileId: validated.defaultAgentProfileId,
        riskStatus: 'normal',
        lastActiveAt: createdAt
      })

      const metrics = repositories.projectMetricSnapshots.create({
        projectId: project.id,
        activeSessionCount: 0,
        runningAgentCount: 0,
        waitingInputCount: 0,
        waitingPermissionCount: 0,
        errorSessionCount: 0,
        fileChangeCount: 0,
        snapshotAt: createdAt
      })

      for (const policySetId of validated.permissionPolicySetIds ?? []) {
        repositories.permissionPolicyBindings.create({
          ownerType: 'project',
          ownerId: project.id,
          permissionPolicySetId: policySetId,
          mergeStrategy: 'additive',
          priority: 0,
          enabled: 1
        })
      }

      return {
        project: this.toDetail(project, metrics),
        postCreateWarning:
          validated.postCreateAction === 'open_first_session'
            ? 'First session creation is available in Phase 5. Project was saved.'
            : undefined
      }
    })
  }

  update(input: ProjectUpdateInput): ProjectDetail {
    const validated = validateProjectUpdateInput(input)
    const repositories = createRepositories(this.db)
    this.assertReferences(validated, repositories)
    const project = repositories.projects.update(validated.id, {
      name: validated.name,
      description: validated.description,
      localPath: validated.localPath,
      phase: validated.archived ? 'archived' : validated.phase,
      defaultAiTeamId: validated.defaultAiTeamId,
      defaultAiRuntimeConfigId: validated.defaultAiRuntimeConfigId,
      defaultAgentProfileId: validated.defaultAgentProfileId,
      archivedAt: validated.archived ? now() : undefined
    })

    if (!project) {
      throw new ValidationError('Project not found.')
    }

    return this.toDetail(project, repositories.projectMetricSnapshots.latestByProject(project.id))
  }

  archive(input: ProjectArchiveInput): ProjectDetail {
    const repositories = createRepositories(this.db)
    const project = repositories.projects.archive(input.id)
    if (!project) {
      throw new ValidationError('Project not found.')
    }

    if (input.archiveSessions) {
      for (const session of repositories.workSessions.listByProject(input.id)) {
        repositories.workSessions.archive(session.id)
      }
    }

    return this.toDetail(project, repositories.projectMetricSnapshots.latestByProject(project.id))
  }

  private assertReferences(
    input: {
      defaultAiTeamId?: string
      defaultAiRuntimeConfigId?: string
      defaultAgentProfileId?: string
    },
    repositories: ReturnType<typeof createRepositories>
  ): void {
    if (input.defaultAiTeamId && !repositories.teams.getById(input.defaultAiTeamId)) {
      throw new ValidationError('Default Team not found.')
    }
    if (
      input.defaultAiRuntimeConfigId &&
      !repositories.runtimes.getById(input.defaultAiRuntimeConfigId)
    ) {
      throw new ValidationError('Default Runtime not found.')
    }
    if (
      input.defaultAgentProfileId &&
      !repositories.agentProfiles.getById(input.defaultAgentProfileId)
    ) {
      throw new ValidationError('Default Agent Profile not found.')
    }
  }

  private toSummary(project: Project, metrics?: ProjectMetricSnapshot): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      localPath: project.localPath,
      mode: project.mode as ProjectSummary['mode'],
      phase: project.phase as ProjectSummary['phase'],
      riskStatus: project.riskStatus as ProjectSummary['riskStatus'],
      defaultAiTeamId: optional(project.defaultAiTeamId),
      defaultAiRuntimeConfigId: optional(project.defaultAiRuntimeConfigId),
      metrics: metrics ? this.toMetrics(metrics) : undefined,
      lastActiveAt: optional(project.lastActiveAt)
    }
  }

  private toDetail(project: Project, metrics?: ProjectMetricSnapshot): ProjectDetail {
    return {
      ...this.toSummary(project, metrics),
      description: optional(project.description),
      defaultAgentProfileId: optional(project.defaultAgentProfileId),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: optional(project.archivedAt)
    }
  }

  private toMetrics(metrics: ProjectMetricSnapshot): ProjectMetrics {
    return {
      activeSessionCount: metrics.activeSessionCount,
      runningAgentCount: metrics.runningAgentCount,
      waitingInputCount: metrics.waitingInputCount,
      waitingPermissionCount: metrics.waitingPermissionCount,
      errorSessionCount: metrics.errorSessionCount,
      recentOutputAt: optional(metrics.recentOutputAt),
      recentFailureAt: optional(metrics.recentFailureAt),
      recentRuntimeType: optional(metrics.recentRuntimeType) as ProjectMetrics['recentRuntimeType'],
      fileChangeCount: metrics.fileChangeCount
    }
  }
}
