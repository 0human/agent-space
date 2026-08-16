import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../shared/workflow'

describe('Desktop Shell navigation', () => {
  beforeEach(() => {
    window.appShell = {
      getRuntimeInfo: vi.fn().mockResolvedValue({ platform: 'darwin', version: '0.1.0' }),
      listProjects: vi.fn().mockResolvedValue([]),
      importProject: vi.fn().mockResolvedValue(null),
      openProjectInIde: vi.fn().mockResolvedValue({ ok: true, error: null }),
      getWorkflow: vi.fn().mockResolvedValue({
        definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
        source: 'built-in',
        path: null,
        validation: { valid: true, errors: [], warnings: [] },
        canStart: true
      }),
      copyWorkflow: vi.fn(),
      reloadWorkflow: vi.fn(),
      startWorkflowRun: vi.fn()
    }
  })

  it('starts at the Chinese Project empty state with direct work entries', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '还没有 Project' })).toBeVisible()
    expect(screen.getByText('创建一个新的 Project，或恢复之前未完成的工作。')).toBeVisible()
    expect(screen.getByRole('button', { name: '创建 Project' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '恢复工作' })).toBeEnabled()
  })

  it('opens the create and resume work entries without requesting privileged access', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    expect(screen.getByRole('heading', { name: '创建 Project' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '返回 Project 概览' }))
    await user.click(screen.getByRole('button', { name: '恢复工作' }))
    expect(screen.getByRole('heading', { name: '恢复工作' })).toBeVisible()
  })

  it('moves between Project Overview and settings through the primary navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '运行环境' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Project 概览' }))

    expect(screen.getByRole('heading', { name: '还没有 Project' })).toBeVisible()
  })

  it('shows imported Project version control state and opens its Workspace in an IDE', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: 'git@github.com:example/demo.git',
      currentBranch: 'feature/import',
      head: '0123456789abcdef0123456789abcdef01234567',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: true,
      dirtySummary: { staged: 1, unstaged: 1, untracked: 1, files: ['a.ts', 'b.ts', 'notes.md'] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    window.appShell.importProject = vi.fn().mockResolvedValue({
      project,
      warning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。'
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(screen.getByRole('button', { name: '选择 Workspace 目录' }))

    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('feature/import')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Dirty Workspace')
    expect(screen.getByText('staged 1')).toBeVisible()
    expect(screen.getByText('unstaged 1')).toBeVisible()
    expect(screen.getByText('untracked 1')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('继续导入不会 stash、reset 或丢弃这些修改。')
    expect(screen.getByText('a.ts, b.ts, notes.md')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(window.appShell.openProjectInIde).toHaveBeenCalledWith('project-1')
  })

  it('restores a persisted Project in Project Overview after restart', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: 'git@github.com:example/demo.git',
      currentBranch: 'main',
      head: '0123456789abcdef0123456789abcdef01234567',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('git@github.com:example/demo.git')).toBeVisible()
    expect(screen.getByText('Clean Workspace')).toBeVisible()
  })

  it('shows an error when the Workspace cannot be opened externally', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: null,
      head: null,
      defaultBranch: null,
      isGreenfield: true,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])
    window.appShell.openProjectInIde = vi.fn().mockRejectedValue(new Error('没有可用的外部应用'))

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('打开外部 IDE 失败。')
  })

  it('shows an error when persisted Projects cannot be loaded', async () => {
    window.appShell.listProjects = vi.fn().mockRejectedValue(new Error('Project 注册表格式无效'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('读取 Project 失败。')
  })

  it('shows when a persisted Workspace has been deleted', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: false,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)

    expect(await screen.findByText('Workspace 已删除或不可访问')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /demo/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('找不到这个 Workspace，路径可能已被移动或删除。')
    expect(screen.getByRole('button', { name: '在外部 IDE 中打开' })).toBeDisabled()
  })

  it('shows a localized error when a Project cannot be imported', async () => {
    const user = userEvent.setup()
    window.appShell.importProject = vi.fn().mockRejectedValue(new Error('EACCES'))

    render(<App />)

    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(screen.getByRole('button', { name: '选择 Workspace 目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('导入 Project 失败。')
  })

  it('shows the read-only Development Workflow structure for a Project', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))

    expect(await screen.findByRole('heading', { name: 'Development Workflow' })).toBeVisible()
    expect(screen.getByText('Idea / Discovery')).toBeVisible()
    expect(screen.getByText('Implementation')).toBeVisible()
    expect(screen.getByText('Merge Gate')).toBeVisible()
    expect(screen.getByText('grill-with-docs@1.0.0')).toBeVisible()
    expect(screen.getByText('内置 Workflow 只读')).toBeVisible()
    expect(screen.getByRole('button', { name: '复制为 Project Workflow' })).toBeEnabled()
  })

  it('copies, reloads, validates, and blocks an invalid Project Workflow', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.copyWorkflow = vi.fn().mockResolvedValue({
      definition: { ...BUILT_IN_DEVELOPMENT_WORKFLOW, name: 'Project Workflow' },
      source: 'project', path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: true, errors: [], warnings: [] }, canStart: true
    })
    window.appShell.reloadWorkflow = vi.fn().mockResolvedValue({
      definition: { ...BUILT_IN_DEVELOPMENT_WORKFLOW, name: 'Edited Workflow' },
      source: 'project', path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: false, errors: ['缺少 Skill research。'], warnings: [] }, canStart: false
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.click(await screen.findByRole('button', { name: '复制为 Project Workflow' }))

    expect(await screen.findByText('/work/demo/.agent-space/workflow.json')).toBeVisible()
    expect(screen.getByText('来源：Development Workflow@1.0.0')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '重新加载并校验' }))
    expect(await screen.findByRole('heading', { name: 'Edited Workflow' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('缺少 Skill research。')
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
  })
})
