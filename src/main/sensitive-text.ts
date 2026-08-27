import type { PermissionPolicy } from '../shared/project'

const sensitiveKey = '(?:token|secret|password|authorization|api[-_]?key|credentials?|(?:[a-z0-9]+_)*(?:token|secret|key|password|credentials?|authorization)(?:_[a-z0-9]+)*|(?:aws|github|openai|azure|google|database|db|npm|node|home|path|pwd|user|shell|ci)[a-z0-9_]*)'
const quotedValue = "(?:\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')"
const unquotedValue = "[^\\s,;&}\\]]+"

const sensitiveAssignment = new RegExp(
  "((?:[\"']?\\b" + sensitiveKey + "\\b[\"']?\\s*[:=]\\s*))(" + quotedValue + "|" + unquotedValue + ")",
  'gi'
)
const sensitiveFlag = new RegExp(
  "((?:--?|/)(?:token|secret|password|authorization|api[-_]?key|credentials?)\\s+)(" + quotedValue + "|" + unquotedValue + ")",
  'gi'
)
const camelCaseSensitiveAssignment = new RegExp(
  "((?:[\"']?(?:[a-z][A-Za-z0-9]*(?:Token|Secret|Password|Authorization|Credentials?|(?:Api|Access|Client|Private|Encryption|Signing)Key)|(?:api|access|client|private|encryption|signing)[-_]?Key|(?:token|secret|password|authorization|credentials?)[A-Z][A-Za-z0-9]*)[\"']?\\s*[:=]\\s*))(" + quotedValue + "|" + unquotedValue + ")",
  'g'
)
const sensitivePathName = /(?:secret|credential|token|password|passwd|(?:api|access|client|private)[-_ ]?key|id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys|git-credentials|htpasswd)/i
const sensitiveKeyName = /(?:token|secret|password|authorization|credential|api[-_]?key|(?:^|[_-])key(?:$|[_-])|(?:^|[a-z])(?:token|secret|password|authorization|credentials?)$|(?:^|[_-])(?:private|access|client|encryption|signing)[-_]?key$|^(?:aws|github|openai|azure|google|database|db|npm|node|home|path|pwd|user|shell|ci)(?:[_-]|$))/i
const pathKeyName = /(?:path|paths|location|locations|cwd|workspace(?:path)?|file(?:path|name)?)(?:$|[_-])/i
const environmentKeyName = /^(?:aws|github|openai|azure|google|database|db|npm|node)(?:[_-]|$)/i
const conventionalEnvironmentKeyName = /^(?:HOME|PATH|PWD|USER|SHELL|CI)(?:_|$)/

export function sanitizeSensitivePath(value: string): string {
  if (/^https?:\/\//i.test(value)) return sanitizeSensitiveText(value)
  const segments = value.replaceAll('\\', '/').split('/')
  return segments.some((segment) =>
    /^\.env(?:[.?#]|$)/i.test(segment) ||
    /^\.?(?:ssh|aws|npmrc|netrc)$/i.test(segment) ||
    sensitivePathName.test(segment) ||
    /\.(?:pem|p12|pfx|key)$/i.test(segment)
  ) ? '<redacted path>' : value
}

function redactAssignment(_match: string, prefix: string, value: string): string {
  const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : ''
  return prefix + quote + '<redacted>' + quote
}

/** Remove credentials and values from strings allowed into UI/runtime projections. */
export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(/(https?:\/\/)([^/@\s]+)@/gi, '$1<redacted>@')
    .replace(/((?:bearer|basic)\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<redacted>')
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-)[A-Za-z0-9._~+\/-]{8,}\b/gi, '<redacted>')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '<redacted>')
    .replace(sensitiveAssignment, redactAssignment)
    .replace(sensitiveFlag, redactAssignment)
    .replace(camelCaseSensitiveAssignment, redactAssignment)
}

/** Sanitize nested runtime values while applying key-aware redaction to object fields. */
export function sanitizeSensitiveValue(value: unknown, key?: string): unknown {
  const redactByKey = Boolean(key && sensitiveKeyName.test(key) && (!pathKeyName.test(key) || environmentKeyName.test(key) || conventionalEnvironmentKeyName.test(key)))
  if (redactByKey) return '<redacted>'
  if (typeof value === 'string') return key && pathKeyName.test(key) ? sanitizeSensitivePath(sanitizeSensitiveText(value)) : sanitizeSensitiveText(value)
  if (Array.isArray(value)) return value.map((entry) => sanitizeSensitiveValue(entry, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeSensitiveValue(entryValue, entryKey)]))
  }
  return value
}

export function sanitizePermissionPolicy(policy: PermissionPolicy): PermissionPolicy {
  return {
    grantedPermissions: policy.grantedPermissions.map(sanitizeSensitiveText),
    ...(policy.allowedPaths ? { allowedPaths: policy.allowedPaths.map((path) => sanitizeSensitivePath(sanitizeSensitiveText(path))) } : {}),
    ...(policy.allowedCommands ? { allowedCommands: policy.allowedCommands.map(sanitizeSensitiveText) } : {}),
    ...(policy.allowedNetworkHosts ? { allowedNetworkHosts: policy.allowedNetworkHosts.map(sanitizeSensitiveText) } : {})
  }
}
