import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

vi.stubGlobal('window', {
  agentSpace: {
    app: {
      getInfo: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          appVersion: '0.1.0',
          platform: 'darwin',
          databaseReady: false
        }
      })
    }
  }
})

describe('DashboardPage', () => {
  it('renders the runtime onboarding entry', () => {
    render(<DashboardPage />)

    expect(screen.getByRole('heading', { name: 'Create your first Runtime' })).toBeInTheDocument()
  })
})
