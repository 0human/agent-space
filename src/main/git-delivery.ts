import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import type { PermissionPolicy, ProjectDeliveryPolicy } from '../shared/project'
import type { PullRequestCheck, PullRequestGate, PullRequestReview, PullRequestState, RuntimeArtifact } from '../shared/workflow-run'

const execFile = promisify(execFileCallback)
const GITHUB_PERMISSION = 'network.github'
const PR_JSON_FIELDS = 'number,url,title,headRefName,baseRefName,headRefOid,statusCheckRollup,reviews,mergeable,isDraft,mergedAt'

export interface GitCommitRequest {
  workspacePath: string
  runId: string
  baseCommit: string | null
  ticket: string | null
}

export interface GitCommitResult {
  commit: string
  artifact: RuntimeArtifact
}

export interface GitPullRequestRequest {
  workspacePath: string
  runId: string
  commit: string
  branch: string
  defaultBranch: string
  remote: string
  ticket: string | null
  title: string
  permissionPolicy: PermissionPolicy
  deliveryPolicy?: ProjectDeliveryPolicy
  pullRequestNumber?: number | null
}

export interface GitPullRequestResult {
  pullRequest: PullRequestState
  artifact: RuntimeArtifact
}

export interface GitMergeRequest {
  workspacePath: string
  runId: string
  pullRequest: Pick<PullRequestState, 'number' | 'headBranch' | 'baseBranch' | 'headCommit' | 'gate'>
  remote: string
  defaultBranch: string
  permissionPolicy: PermissionPolicy
  deliveryPolicy?: ProjectDeliveryPolicy
  gateApproved: boolean
}

interface GitDeliveryDependencies {
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  execGitHub?: (workspacePath: string, args: string[]) => Promise<string>
  resolveSshHost?: (host: string) => Promise<string | null>
}

interface GitHubPullRequestPayload {
  number?: number
  url?: string
  title?: string
  headRefName?: string
  baseRefName?: string
  headRefOid?: string
  statusCheckRollup?: unknown[]
  reviews?: unknown[]
  mergeable?: string | null
  isDraft?: boolean
  mergedAt?: string | null
}

interface GitHubPullRequestListCandidate {
  number?: number
  url?: string
  headRefName?: string
  baseRefName?: string
  state?: string
  body?: string
  createdAt?: string
}

function safeLabel(value: string | null): string {
  return (value ?? 'untracked').replace(/[\r\n]/g, ' ').trim() || 'untracked'
}

export async function defaultResolveSshHost(host: string): Promise<string | null> {
  try {
    const result = await execFile('ssh', ['-G', host], { encoding: 'utf8' })
    return result.stdout.match(/^hostname\s+(\S+)/im)?.[1] ?? null
  } catch {
    return null
  }
}

export async function resolveGitHubRepository(remote: string, resolveSshHost = defaultResolveSshHost): Promise<string> {
  const value = remote.trim()
  let host: string | null = null
  let path: string | null = null
  let sshRemote = false

  if (/^https?:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'http:' || (parsed.protocol === 'https:' && (parsed.username || parsed.password))) throw new Error('unsafe remote')
      host = parsed.hostname
      path = parsed.pathname.replace(/^\/+|\/+$/g, '')
      sshRemote = /^ssh:\/\//i.test(value)
    } catch {
      throw new Error('Project remote 不是有效的 GitHub 仓库。')
    }
  } else {
    const scpMatch = value.match(/^[^@/\s]+@([^:\s]+):(.+)$/)
    if (scpMatch) {
      host = scpMatch[1]
      path = scpMatch[2].replace(/^\/+|\/+$/g, '')
      sshRemote = true
    }
  }

  if (!host || !path) throw new Error('Project remote 不是有效的 GitHub 仓库。')
  if (!sshRemote && host.toLowerCase() !== 'github.com') throw new Error('Project remote 不是有效的 GitHub 仓库。')
  const resolvedHost = host.toLowerCase() === 'github.com' ? host : await resolveSshHost(host)
  if (resolvedHost?.toLowerCase() !== 'github.com') throw new Error('Project remote 不是有效的 GitHub 仓库。')
  const slug = path.replace(/\.git$/i, '')
  if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) throw new Error('Project remote 不是有效的 GitHub 仓库。')
  return slug
}

function requirePermission(policy: PermissionPolicy, permission = GITHUB_PERMISSION): void {
  if (!policy.grantedPermissions.includes(permission)) throw new Error(`Permission Policy 阻止 GitHub 操作：缺少 ${permission}。`)
}

function normalizeBranchRef(value: string): string {
  return value.trim().replace(/^refs\/heads\//i, '')
}

function validateBranch(branch: string, defaultBranch: string): void {
  const normalizedBranch = normalizeBranchRef(branch)
  const normalizedDefaultBranch = normalizeBranchRef(defaultBranch)
  if (!normalizedDefaultBranch || !normalizedBranch || normalizedBranch === normalizedDefaultBranch) throw new Error('Permission Policy 阻止更新默认分支。')
  if (normalizedBranch.startsWith('-') || normalizedBranch.includes('..') || normalizedBranch.includes('@{') || normalizedBranch.endsWith('.') || !/^[A-Za-z0-9._/-]+$/.test(normalizedBranch)) throw new Error('功能分支名称无效。')
}

function parseJson<T>(output: string): T {
  try {
    return JSON.parse(output) as T
  } catch (error) {
    throw new Error(`GitHub CLI 返回的 JSON 无效：${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeCheck(value: unknown): PullRequestCheck | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const name = typeof candidate.name === 'string'
    ? candidate.name
    : typeof candidate.context === 'string'
      ? candidate.context
      : typeof candidate.workflowName === 'string'
        ? candidate.workflowName
        : ''
  if (!name) return null
  const status = typeof candidate.status === 'string'
    ? candidate.status
    : typeof candidate.state === 'string'
      ? candidate.state
      : 'UNKNOWN'
  const conclusion = typeof candidate.conclusion === 'string'
    ? candidate.conclusion
    : typeof candidate.state === 'string'
      ? candidate.state
      : null
  return {
    name,
    status,
    conclusion,
    detailsUrl: typeof candidate.detailsUrl === 'string' ? candidate.detailsUrl : null
  }
}

function normalizeReview(value: unknown): PullRequestReview | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const author = candidate.author && typeof candidate.author === 'object' && typeof (candidate.author as Record<string, unknown>).login === 'string'
    ? (candidate.author as Record<string, unknown>).login as string
    : typeof candidate.author === 'string'
      ? candidate.author
      : 'unknown'
  const state = typeof candidate.state === 'string' ? candidate.state : 'UNKNOWN'
  return {
    author,
    state,
    submittedAt: typeof candidate.submittedAt === 'string' ? candidate.submittedAt : null
  }
}

function checkSucceeded(check: PullRequestCheck): boolean {
  const conclusion = check.conclusion?.toUpperCase()
  if (conclusion) return conclusion === 'SUCCESS' || conclusion === 'PASSED'
  return check.status.toUpperCase() === 'SUCCESS'
}

function evaluateGate(checks: PullRequestCheck[], reviews: PullRequestReview[], mergeable: string, draft: boolean, merged: boolean, policy: ProjectDeliveryPolicy | undefined): PullRequestGate {
  const requiredChecks = policy?.requiredChecks ?? []
  const selectedChecks = requiredChecks.length > 0
    ? requiredChecks.map((name) => checks.find((check) => check.name === name)).filter((check): check is PullRequestCheck => Boolean(check))
    : checks
  const missingChecks = requiredChecks.filter((name) => !checks.some((check) => check.name === name))
  const checksSatisfied = missingChecks.length === 0 && selectedChecks.length > 0 && selectedChecks.every(checkSucceeded)
  const requiredApprovals = Math.max(1, policy?.requiredApprovals ?? 1)
  const latestReviews = new Map<string, PullRequestReview>()
  for (const review of reviews) {
    const previous = latestReviews.get(review.author)
    if (!previous || !previous.submittedAt || !review.submittedAt || review.submittedAt >= previous.submittedAt) latestReviews.set(review.author, review)
  }
  const currentReviews = [...latestReviews.values()]
  const changedRequested = currentReviews.some((review) => review.state.toUpperCase() === 'CHANGES_REQUESTED')
  const approvedAuthors = new Set(currentReviews.filter((review) => review.state.toUpperCase() === 'APPROVED').map((review) => review.author))
  const reviewsSatisfied = !changedRequested && approvedAuthors.size >= requiredApprovals
  const mergeabilitySatisfied = !merged && !draft && mergeable.toUpperCase() === 'MERGEABLE'
  const reasons: string[] = []
  if (!checksSatisfied) reasons.push(missingChecks.length > 0 ? `等待 checks：${missingChecks.join(', ')}` : 'checks 尚未全部通过。')
  if (!reviewsSatisfied) reasons.push(changedRequested ? '存在 changes requested review。' : `等待 ${requiredApprovals} 个 approved review。`)
  if (!mergeabilitySatisfied) reasons.push(merged ? 'Pull Request 已合并。' : draft ? 'Pull Request 仍是 draft。' : 'Pull Request 当前不可合并。')
  return { checksSatisfied, reviewsSatisfied, mergeabilitySatisfied, canMerge: checksSatisfied && reviewsSatisfied && mergeabilitySatisfied, reason: reasons.length > 0 ? reasons.join(' ') : null }
}

function toPullRequestState(payload: GitHubPullRequestPayload, policy?: ProjectDeliveryPolicy): PullRequestState {
  const checks = (payload.statusCheckRollup ?? []).map(normalizeCheck).filter((check): check is PullRequestCheck => Boolean(check))
  const reviews = (payload.reviews ?? []).map(normalizeReview).filter((review): review is PullRequestReview => Boolean(review))
  const mergeable = payload.mergeable ?? 'UNKNOWN'
  const merged = Boolean(payload.mergedAt)
  return {
    number: Number(payload.number ?? 0),
    url: payload.url ?? '',
    title: payload.title ?? '',
    headBranch: payload.headRefName ?? '',
    baseBranch: payload.baseRefName ?? '',
    headCommit: payload.headRefOid ?? '',
    checks,
    reviews,
    mergeable,
    merged,
    mergedAt: payload.mergedAt ?? null,
    draft: Boolean(payload.isDraft),
    gate: evaluateGate(checks, reviews, mergeable, Boolean(payload.isDraft), merged, policy),
    updatedAt: new Date().toISOString()
  }
}

function pullRequestArtifact(runId: string, pullRequest: PullRequestState): RuntimeArtifact {
  return {
    type: 'pull-request',
    name: `PR #${pullRequest.number}`,
    runId,
    location: pullRequest.url,
    versionHash: pullRequest.headCommit,
    status: pullRequest.merged ? 'merged' : pullRequest.gate.canMerge ? 'ready' : 'pending'
  }
}

function pullRequestViewArgs(repo: string, number: number): string[] {
  return ['pr', 'view', String(number), '--repo', repo, '--json', PR_JSON_FIELDS]
}

function pullRequestBody(request: GitPullRequestRequest): string {
  return `Run ID: ${safeLabel(request.runId)}\nTicket: #${safeLabel(request.ticket)}\nBase Commit: ${safeLabel(request.commit)}`
}

function isRunPullRequest(candidate: GitHubPullRequestListCandidate, request: GitPullRequestRequest): boolean {
  const expected = `Run ID: ${safeLabel(request.runId)}`
  return candidate.body?.split(/\r?\n/).some((line) => line.trim() === expected) ?? false
}

function selectPullRequestNumber(candidates: GitHubPullRequestListCandidate[], request: GitPullRequestRequest): number | undefined {
  const branch = normalizeBranchRef(request.branch)
  const defaultBranch = normalizeBranchRef(request.defaultBranch)
  const matching = candidates.filter((candidate) => normalizeBranchRef(candidate.headRefName ?? '') === branch && normalizeBranchRef(candidate.baseRefName ?? '') === defaultBranch && candidate.number)
  const runMatches = matching.filter((candidate) => isRunPullRequest(candidate, request))
  const selectable = runMatches.length > 0 ? runMatches : matching.length === 1 && !matching[0]?.body?.includes('Run ID:') ? matching : []
  const ranked = selectable.map((candidate, index) => ({
    candidate,
    score: (isRunPullRequest(candidate, request) ? 4 : 0) + (candidate.state?.toUpperCase() === 'OPEN' ? 2 : 0),
    index
  })).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    const rightCreated = Date.parse(right.candidate.createdAt ?? '')
    const leftCreated = Date.parse(left.candidate.createdAt ?? '')
    if (Number.isFinite(rightCreated) && Number.isFinite(leftCreated) && rightCreated !== leftCreated) return rightCreated - leftCreated
    return left.index - right.index
  })
  return ranked[0]?.candidate.number
}

function validatePullRequestIdentity(pullRequest: PullRequestState, request: GitPullRequestRequest): void {
  if (normalizeBranchRef(pullRequest.headBranch) !== normalizeBranchRef(request.branch) || normalizeBranchRef(pullRequest.baseBranch) !== normalizeBranchRef(request.defaultBranch)) {
    throw new Error('Permission Policy 阻止更新不属于当前 Run 的 Pull Request。')
  }
  if (request.commit.trim() && pullRequest.headCommit !== request.commit.trim()) {
    throw new Error('Permission Policy 阻止更新：远端 Pull Request head commit 与已验证 commit 不一致。')
  }
}

export function createDefaultGitHubExecutor(): GitDeliveryDependencies['execGitHub'] {
  return async (workspacePath, args) => {
    const result = await execFile('gh', args, { cwd: workspacePath, encoding: 'utf8' })
    return result.stdout
  }
}

export function createGitDeliveryManager(dependencies: GitDeliveryDependencies) {
  const execGitHub = dependencies.execGitHub
  const resolveSshHost = dependencies.resolveSshHost ?? defaultResolveSshHost

  async function readPullRequest(workspacePath: string, remote: string, number: number, policy?: ProjectDeliveryPolicy, permissionPolicy?: PermissionPolicy): Promise<PullRequestState> {
    if (!execGitHub) throw new Error('GitHub CLI 不可用。')
    if (permissionPolicy) requirePermission(permissionPolicy)
    const repo = await resolveGitHubRepository(remote, resolveSshHost)
    const payload = parseJson<GitHubPullRequestPayload>(await execGitHub(workspacePath, pullRequestViewArgs(repo, number)))
    const pullRequest = toPullRequestState(payload, policy)
    if (!pullRequest.number || !pullRequest.url) throw new Error('GitHub 返回的 Pull Request 状态无效。')
    return pullRequest
  }

  async function preflightPullRequest(workspacePath: string, remote: string): Promise<void> {
    await resolveGitHubRepository(remote, resolveSshHost)
    if (!execGitHub) throw new Error('GitHub CLI 不可用。')
    await execGitHub(workspacePath, ['auth', 'status'])
  }

  async function commitAfterReview(request: GitCommitRequest): Promise<GitCommitResult> {
    await dependencies.execGit(request.workspacePath, ['add', '-A'])
    try {
      await dependencies.execGit(request.workspacePath, [
        'commit', '-m', `agent-space: complete implementation for #${safeLabel(request.ticket)} (Run ${safeLabel(request.runId)}, base ${safeLabel(request.baseCommit)})`
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/nothing to commit|working tree clean/i.test(message)) throw error
    }
    const commit = (await dependencies.execGit(request.workspacePath, ['rev-parse', 'HEAD'])).trim()
    if (!commit) throw new Error('Git commit 不可用：无法读取 HEAD。')
    return {
      commit,
      artifact: {
        type: 'commit',
        name: 'commit',
        runId: request.runId,
        location: `${request.workspacePath}@${commit}`,
        versionHash: commit,
        status: 'available'
      }
    }
  }

  async function deliverPullRequest(request: GitPullRequestRequest): Promise<GitPullRequestResult> {
    if (!execGitHub) throw new Error('GitHub CLI 不可用。')
    requirePermission(request.permissionPolicy)
    validateBranch(request.branch, request.defaultBranch)
    if (!request.commit.trim()) throw new Error('Permission Policy 阻止创建 PR：未验证本地 commit。')
    const headCommit = (await dependencies.execGit(request.workspacePath, ['rev-parse', 'HEAD'])).trim()
    if (!headCommit || headCommit !== request.commit.trim()) throw new Error('Permission Policy 阻止创建 PR：本地 HEAD 与已验证 commit 不一致。')
    const repo = await resolveGitHubRepository(request.remote, resolveSshHost)
    const branch = normalizeBranchRef(request.branch)
    const defaultBranch = normalizeBranchRef(request.defaultBranch)
    await dependencies.execGit(request.workspacePath, ['push', '--set-upstream', request.remote, branch])

    let number = request.pullRequestNumber ?? undefined
    if (number) {
      const persisted = await readPullRequest(request.workspacePath, request.remote, number, request.deliveryPolicy)
      validatePullRequestIdentity(persisted, request)
    } else {
      const listed = parseJson<GitHubPullRequestListCandidate[]>(await execGitHub(request.workspacePath, ['pr', 'list', '--repo', repo, '--head', branch, '--state', 'all', '--limit', '1000', '--json', 'number,url,headRefName,baseRefName,state,body,createdAt']))
      number = selectPullRequestNumber(listed, request)
    }
    if (!number) {
      const output = await execGitHub(request.workspacePath, [
        'pr', 'create', '--repo', repo, '--base', defaultBranch, '--head', branch,
        '--title', request.title, '--body', pullRequestBody(request)
      ])
      const url = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)?.[0]
      number = url ? Number(url.match(/\/pull\/(\d+)/i)?.[1]) : undefined
      if (!number) throw new Error('GitHub 未返回新建 Pull Request 编号。')
    } else {
      await execGitHub(request.workspacePath, ['pr', 'edit', String(number), '--repo', repo, '--title', request.title, '--body', pullRequestBody(request)])
    }
    const pullRequest = await readPullRequest(request.workspacePath, request.remote, number, request.deliveryPolicy)
    validatePullRequestIdentity(pullRequest, request)
    return { pullRequest, artifact: pullRequestArtifact(request.runId, pullRequest) }
  }

  async function mergePullRequest(request: GitMergeRequest): Promise<GitPullRequestResult> {
    if (!execGitHub) throw new Error('GitHub CLI 不可用。')
    requirePermission(request.permissionPolicy)
    validateBranch(request.pullRequest.headBranch, request.defaultBranch)
    if (normalizeBranchRef(request.pullRequest.baseBranch) !== normalizeBranchRef(request.defaultBranch)) throw new Error('Permission Policy 阻止合并到非默认目标分支。')
    if (!request.pullRequest.headCommit.trim()) throw new Error('Merge Gate 无法验证：缺少已验证 head commit。')
    if (!request.gateApproved) throw new Error('Merge Gate 尚未批准。')
    const repo = await resolveGitHubRepository(request.remote, resolveSshHost)
    const current = await readPullRequest(request.workspacePath, request.remote, request.pullRequest.number, request.deliveryPolicy)
    if (normalizeBranchRef(current.headBranch) !== normalizeBranchRef(request.pullRequest.headBranch) || normalizeBranchRef(current.baseBranch) !== normalizeBranchRef(request.defaultBranch) || current.headCommit !== request.pullRequest.headCommit) {
      throw new Error('Merge Gate 状态已变化：请重新读取 Pull Request 后再批准。')
    }
    if (!current.gate.canMerge) throw new Error(`Merge Gate 不可批准：${current.gate.reason ?? 'checks 或 review 未满足。'}`)
    await execGitHub(request.workspacePath, [
      'pr', 'merge', String(request.pullRequest.number), '--repo', repo, '--squash', '--delete-branch', '--match-head-commit', request.pullRequest.headCommit
    ])
    const pullRequest = await readPullRequest(request.workspacePath, request.remote, request.pullRequest.number, request.deliveryPolicy)
    return { pullRequest, artifact: pullRequestArtifact(request.runId, pullRequest) }
  }

  return { commitAfterReview, deliverPullRequest, mergePullRequest, refreshPullRequest: readPullRequest, preflightPullRequest }
}
