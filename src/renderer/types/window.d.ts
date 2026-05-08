import type { AgentSpaceAPI } from '../../shared/api'

declare global {
  interface Window {
    agentSpace: AgentSpaceAPI
  }
}

export {}
