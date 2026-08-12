import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('Desktop Shell navigation', () => {
  beforeEach(() => {
    window.appShell = {
      getRuntimeInfo: vi.fn().mockResolvedValue({ platform: 'darwin', version: '0.1.0' })
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
})
