import Database from 'better-sqlite3'
import { app } from 'electron'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'
import * as schema from './schema'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

export interface DatabaseHandle {
  sqlite: Database.Database
  db: AppDatabase
  path: string
}

let handle: DatabaseHandle | undefined

export function getDefaultDatabasePath(): string {
  return join(app.getPath('userData'), 'agent-space.sqlite')
}

export function createDatabaseHandle(databasePath = getDefaultDatabasePath()): DatabaseHandle {
  mkdirSync(dirname(databasePath), { recursive: true })

  const sqlite = new Database(databasePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  runMigrations(sqlite)

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    path: databasePath
  }
}

export function initializeDatabase(databasePath?: string): DatabaseHandle {
  if (!handle) {
    handle = createDatabaseHandle(databasePath)
  }

  return handle
}

export function getDatabaseHandle(): DatabaseHandle {
  if (!handle) {
    return initializeDatabase()
  }

  return handle
}

export function closeDatabase(): void {
  if (handle) {
    handle.sqlite.close()
    handle = undefined
  }
}
