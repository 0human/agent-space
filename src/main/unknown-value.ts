export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
