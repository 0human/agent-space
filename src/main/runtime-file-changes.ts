import type { RuntimeFileChange } from '../shared/workflow-run'
import { asRecord as record } from './unknown-value'
import { sanitizeSensitivePath, sanitizeSensitiveText } from './sensitive-text'

function lineCounts(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

export function fileChanges(value: unknown): RuntimeFileChange[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const change = record(entry)
    const path = typeof change?.path === 'string' ? change.path : null
    const diff = typeof change?.diff === 'string' ? change.diff : ''
    const kindValue = typeof change?.kind === 'string' ? change.kind : record(change?.kind)?.type
    if (!path || !['add', 'update', 'delete'].includes(String(kindValue))) return []
    const counts = lineCounts(diff)
    return [{ path: sanitizeSensitivePath(sanitizeSensitiveText(path)), kind: kindValue as RuntimeFileChange['kind'], ...counts }]
  })
}

