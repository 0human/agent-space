import { isAbsolute, relative, resolve } from 'node:path'

export function isPathAllowed(candidate: string, allowedPaths?: string[]): boolean {
  if (!allowedPaths?.length) return true
  const path = resolve(candidate)
  return allowedPaths.some((allowed) => {
    const relativePath = relative(resolve(allowed), path)
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  })
}

export function isNetworkHostAllowed(host: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts?.length) return true
  const normalizedHost = host.toLowerCase()
  return allowedHosts.some((allowed) => normalizedHost === allowed.toLowerCase() || (allowed.startsWith('*.') && normalizedHost.endsWith(allowed.slice(1).toLowerCase())))
}

export function isCommandAllowed(command: string, allowedCommands?: string[]): boolean {
  return !allowedCommands?.length || allowedCommands.includes(command)
}
