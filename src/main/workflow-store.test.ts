// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it } from 'vitest'

import { createSqliteRunStore } from './workflow-store'

const require = createRequire(import.meta.url)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Workflow Store forward migrations', () => {
  it('opens a database written by the previous schema and keeps it usable', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'workflow-runs.sqlite')
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(join('sql.js', 'dist', file)) })
    const database = new SQL.Database()

    database.run(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        idea TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_version TEXT NOT NULL,
        workflow_json TEXT NOT NULL,
        project_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    await writeFile(databasePath, Buffer.from(database.export()))
    database.close()

    const store = createSqliteRunStore({ databasePath })
    await expect(store.listRuns('missing-project')).resolves.toEqual([])
    await expect(store.close()).resolves.toBeUndefined()
  })
})
