import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { AppDatabase } from './client'
import {
  agentProfiles,
  aiRuntimeConfigs,
  aiRuntimeSecrets,
  aiTeamMembers,
  aiTeams,
  contextItems,
  contextSnapshots,
  messages,
  permissionPolicyBindings,
  permissionPolicySets,
  projectMetricSnapshots,
  projects,
  runtimeEvents,
  runtimeRuns,
  sessionContextRefs,
  workSessions,
  type NewAgentProfile,
  type NewAiRuntimeConfig,
  type NewAiRuntimeSecret,
  type NewAiTeam,
  type NewAiTeamMember,
  type NewContextItem,
  type NewContextSnapshot,
  type NewMessage,
  type NewPermissionPolicyBinding,
  type NewPermissionPolicySet,
  type NewProject,
  type NewProjectMetricSnapshot,
  type NewRuntimeEvent,
  type NewRuntimeRun,
  type NewSessionContextRef,
  type NewWorkSession
} from './schema'

type MutableTimestamps = { createdAt: string; updatedAt: string }
type GeneratedFields = 'id' | 'createdAt' | 'updatedAt'
type CreateInput<T> = Omit<T, GeneratedFields> & Partial<Pick<T, Extract<keyof T, GeneratedFields>>>
type CreatedAtInput<T> = Omit<T, 'id' | 'createdAt'> &
  Partial<Pick<T, Extract<keyof T, 'id' | 'createdAt'>>>
type IdInput<T> = Omit<T, 'id'> & Partial<Pick<T, Extract<keyof T, 'id'>>>

function now(): string {
  return new Date().toISOString()
}

function withId<T extends { id?: string }>(input: T): T & { id: string } {
  return {
    ...input,
    id: input.id ?? randomUUID()
  }
}

function withTimestamps<T extends Partial<MutableTimestamps>>(input: T): T & MutableTimestamps {
  const timestamp = now()
  return {
    ...input,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp
  }
}

function withCreatedAt<T extends { createdAt?: string }>(input: T): T & { createdAt: string } {
  return {
    ...input,
    createdAt: input.createdAt ?? now()
  }
}

type RepositoryDatabase = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete'>

export function createRepositories(db: RepositoryDatabase) {
  return {
    agentProfiles: {
      getById(id: string) {
        return db.select().from(agentProfiles).where(eq(agentProfiles.id, id)).get()
      },
      list() {
        return db.select().from(agentProfiles).all()
      },
      create(input: CreateInput<NewAgentProfile>) {
        return db
          .insert(agentProfiles)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewAgentProfile>) {
        return db
          .update(agentProfiles)
          .set({ ...input, updatedAt: now() })
          .where(eq(agentProfiles.id, id))
          .returning()
          .get()
      }
    },

    permissionPolicySets: {
      getById(id: string) {
        return db.select().from(permissionPolicySets).where(eq(permissionPolicySets.id, id)).get()
      },
      list() {
        return db.select().from(permissionPolicySets).all()
      },
      create(input: CreateInput<NewPermissionPolicySet>) {
        return db
          .insert(permissionPolicySets)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewPermissionPolicySet>) {
        return db
          .update(permissionPolicySets)
          .set({ ...input, updatedAt: now() })
          .where(eq(permissionPolicySets.id, id))
          .returning()
          .get()
      }
    },

    permissionPolicyBindings: {
      create(input: CreateInput<NewPermissionPolicyBinding>) {
        return db
          .insert(permissionPolicyBindings)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      list() {
        return db.select().from(permissionPolicyBindings).all()
      },
      listByOwner(ownerType: string, ownerId: string) {
        return db
          .select()
          .from(permissionPolicyBindings)
          .where(
            and(
              eq(permissionPolicyBindings.ownerType, ownerType),
              eq(permissionPolicyBindings.ownerId, ownerId),
              eq(permissionPolicyBindings.enabled, 1)
            )
          )
          .orderBy(asc(permissionPolicyBindings.priority))
          .all()
      },
      listByOwners(owners: { ownerType: string; ownerId: string }[]) {
        if (owners.length === 0) {
          return []
        }

        return owners.flatMap((owner) => this.listByOwner(owner.ownerType, owner.ownerId))
      },
      update(id: string, input: Partial<NewPermissionPolicyBinding>) {
        return db
          .update(permissionPolicyBindings)
          .set({ ...input, updatedAt: now() })
          .where(eq(permissionPolicyBindings.id, id))
          .returning()
          .get()
      }
    },

    runtimes: {
      getById(id: string) {
        return db.select().from(aiRuntimeConfigs).where(eq(aiRuntimeConfigs.id, id)).get()
      },
      list() {
        return db.select().from(aiRuntimeConfigs).all()
      },
      create(input: CreateInput<NewAiRuntimeConfig>) {
        return db
          .insert(aiRuntimeConfigs)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewAiRuntimeConfig>) {
        return db
          .update(aiRuntimeConfigs)
          .set({ ...input, updatedAt: now() })
          .where(eq(aiRuntimeConfigs.id, id))
          .returning()
          .get()
      },
      listEnabled() {
        return db
          .select()
          .from(aiRuntimeConfigs)
          .where(eq(aiRuntimeConfigs.enabled, 1))
          .orderBy(desc(aiRuntimeConfigs.lastUsedAt))
          .all()
      }
    },

    runtimeSecrets: {
      create(input: CreateInput<NewAiRuntimeSecret>) {
        return db
          .insert(aiRuntimeSecrets)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      listByRuntime(runtimeConfigId: string) {
        return db
          .select()
          .from(aiRuntimeSecrets)
          .where(eq(aiRuntimeSecrets.runtimeConfigId, runtimeConfigId))
          .all()
      },
      deleteByRuntime(runtimeConfigId: string) {
        return db
          .delete(aiRuntimeSecrets)
          .where(eq(aiRuntimeSecrets.runtimeConfigId, runtimeConfigId))
          .returning()
          .all()
      }
    },

    teams: {
      getById(id: string) {
        return db.select().from(aiTeams).where(eq(aiTeams.id, id)).get()
      },
      list() {
        return db.select().from(aiTeams).all()
      },
      create(input: CreateInput<NewAiTeam>) {
        return db
          .insert(aiTeams)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewAiTeam>) {
        return db
          .update(aiTeams)
          .set({ ...input, updatedAt: now() })
          .where(eq(aiTeams.id, id))
          .returning()
          .get()
      }
    },

    teamMembers: {
      create(input: CreateInput<NewAiTeamMember>) {
        return db
          .insert(aiTeamMembers)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      listByTeam(teamId: string) {
        return db
          .select()
          .from(aiTeamMembers)
          .where(eq(aiTeamMembers.teamId, teamId))
          .orderBy(asc(aiTeamMembers.sortOrder))
          .all()
      }
    },

    projects: {
      getById(id: string) {
        return db.select().from(projects).where(eq(projects.id, id)).get()
      },
      list() {
        return db.select().from(projects).all()
      },
      create(input: CreateInput<NewProject>) {
        const mode = input.defaultAiTeamId ? 'team' : 'manual'
        return db
          .insert(projects)
          .values(withTimestamps(withId({ ...input, mode })))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewProject>) {
        const nextMode =
          'defaultAiTeamId' in input ? (input.defaultAiTeamId ? 'team' : 'manual') : undefined
        return db
          .update(projects)
          .set({ ...input, ...(nextMode ? { mode: nextMode } : {}), updatedAt: now() })
          .where(eq(projects.id, id))
          .returning()
          .get()
      },
      listActive() {
        return db
          .select()
          .from(projects)
          .where(isNull(projects.archivedAt))
          .orderBy(desc(projects.lastActiveAt))
          .all()
      },
      archive(id: string) {
        return db
          .update(projects)
          .set({ archivedAt: now(), updatedAt: now() })
          .where(eq(projects.id, id))
          .returning()
          .get()
      }
    },

    projectMetricSnapshots: {
      create(input: IdInput<NewProjectMetricSnapshot>) {
        return db.insert(projectMetricSnapshots).values(withId(input)).returning().get()
      },
      listByProject(projectId: string) {
        return db
          .select()
          .from(projectMetricSnapshots)
          .where(eq(projectMetricSnapshots.projectId, projectId))
          .all()
      }
    },

    workSessions: {
      getById(id: string) {
        return db.select().from(workSessions).where(eq(workSessions.id, id)).get()
      },
      list() {
        return db.select().from(workSessions).all()
      },
      create(input: CreateInput<NewWorkSession>) {
        return db
          .insert(workSessions)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      update(id: string, input: Partial<NewWorkSession>) {
        return db
          .update(workSessions)
          .set({ ...input, updatedAt: now() })
          .where(eq(workSessions.id, id))
          .returning()
          .get()
      },
      listByProject(projectId: string) {
        return db
          .select()
          .from(workSessions)
          .where(eq(workSessions.projectId, projectId))
          .orderBy(desc(workSessions.updatedAt))
          .all()
      },
      archive(id: string) {
        return db
          .update(workSessions)
          .set({ archivedAt: now(), updatedAt: now() })
          .where(eq(workSessions.id, id))
          .returning()
          .get()
      }
    },

    messages: {
      create(input: CreatedAtInput<NewMessage>) {
        return db
          .insert(messages)
          .values(withCreatedAt(withId(input)))
          .returning()
          .get()
      },
      listBySession(workSessionId: string, limit = 50, offset = 0) {
        return db
          .select()
          .from(messages)
          .where(eq(messages.workSessionId, workSessionId))
          .orderBy(asc(messages.createdAt))
          .limit(limit)
          .offset(offset)
          .all()
      }
    },

    runtimeRuns: {
      create(input: IdInput<NewRuntimeRun>) {
        return db.insert(runtimeRuns).values(withId(input)).returning().get()
      },
      update(id: string, input: Partial<NewRuntimeRun>) {
        return db.update(runtimeRuns).set(input).where(eq(runtimeRuns.id, id)).returning().get()
      },
      listBySession(workSessionId: string) {
        return db
          .select()
          .from(runtimeRuns)
          .where(eq(runtimeRuns.workSessionId, workSessionId))
          .orderBy(desc(runtimeRuns.startedAt))
          .all()
      }
    },

    runtimeEvents: {
      create(input: CreatedAtInput<NewRuntimeEvent>) {
        return db
          .insert(runtimeEvents)
          .values(withCreatedAt(withId(input)))
          .returning()
          .get()
      },
      listByRun(runId: string) {
        return db
          .select()
          .from(runtimeEvents)
          .where(eq(runtimeEvents.runId, runId))
          .orderBy(asc(runtimeEvents.sequenceNo))
          .all()
      }
    },

    contextItems: {
      create(input: CreateInput<NewContextItem>) {
        return db
          .insert(contextItems)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      },
      listByProject(projectId: string) {
        return db.select().from(contextItems).where(eq(contextItems.projectId, projectId)).all()
      }
    },

    contextSnapshots: {
      create(input: CreateInput<NewContextSnapshot>) {
        return db
          .insert(contextSnapshots)
          .values(withTimestamps(withId(input)))
          .returning()
          .get()
      }
    },

    sessionContextRefs: {
      create(input: CreatedAtInput<NewSessionContextRef>) {
        return db
          .insert(sessionContextRefs)
          .values(withCreatedAt(withId(input)))
          .returning()
          .get()
      },
      listBySessions(workSessionIds: string[]) {
        if (workSessionIds.length === 0) {
          return []
        }

        return db
          .select()
          .from(sessionContextRefs)
          .where(inArray(sessionContextRefs.workSessionId, workSessionIds))
          .all()
      }
    }
  }
}

export type Repositories = ReturnType<typeof createRepositories>
