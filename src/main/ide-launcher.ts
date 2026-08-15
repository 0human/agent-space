import { spawn as spawnProcess } from 'node:child_process'

type SpawnedProcess = {
  once: (event: 'error' | 'spawn', listener: (error?: Error) => void) => void
  unref: () => void
}

type Spawn = (
  command: string,
  args: string[],
  options: { detached: true; stdio: 'ignore'; windowsHide: true; shell: boolean }
) => SpawnedProcess

const ideCommands: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['code', 'cursor', 'codium', 'idea', 'zed', 'subl'],
  linux: ['code', 'cursor', 'codium', 'idea', 'zed', 'subl'],
  win32: ['code.cmd', 'cursor.cmd', 'codium.cmd', 'idea64.exe', 'zed.exe', 'subl.exe']
}

function launch(spawn: Spawn, command: string, workspacePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, [workspacePath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: command.endsWith('.cmd')
    })
    process.once('error', reject)
    process.once('spawn', () => {
      process.unref()
      resolve()
    })
  })
}

export function createDefaultIdeLauncher(
  platform: NodeJS.Platform = process.platform,
  spawn: Spawn = spawnProcess as unknown as Spawn
): (workspacePath: string) => Promise<void> {
  const commands = ideCommands[platform] ?? ideCommands.linux ?? []

  return async (workspacePath: string): Promise<void> => {
    for (const command of commands) {
      try {
        await launch(spawn, command, workspacePath)
        return
      } catch {
        // Try the next installed IDE command.
      }
    }

    throw new Error('No supported external IDE command is available')
  }
}
