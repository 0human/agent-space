import type { AppDatabase } from './client'
import { createRepositories } from './repositories'

export function createTransactionRunner(db: AppDatabase) {
  return function transaction<T>(callback: (repositories: ReturnType<typeof createRepositories>) => T): T {
    return db.transaction((tx) => {
      return callback(createRepositories(tx))
    })
  }
}

export type TransactionRunner = ReturnType<typeof createTransactionRunner>
