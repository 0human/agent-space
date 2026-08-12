import { spawn } from 'node:child_process'
import electronPath from 'electron'

const readySignal = 'AGENT_SPACE_APP_READY'
const timeoutMs = 20_000
const electronEnvironment = { ...process.env }

delete electronEnvironment.ELECTRON_RUN_AS_NODE

const electron = spawn(electronPath, ['out/main/index.js'], {
  env: {
    ...electronEnvironment,
    AGENT_SPACE_STARTUP_SMOKE: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
let ready = false

const timeout = setTimeout(() => {
  electron.kill()
  process.stderr.write(`Desktop Shell did not become ready within ${timeoutMs}ms.\n${output}`)
  process.exitCode = 1
}, timeoutMs)

function capture(chunk) {
  const text = chunk.toString()
  output += text

  if (text.includes(readySignal)) {
    ready = true
  }
}

electron.stdout.on('data', capture)
electron.stderr.on('data', capture)

electron.on('error', (error) => {
  clearTimeout(timeout)
  process.stderr.write(`Failed to launch Desktop Shell: ${error.message}\n`)
  process.exitCode = 1
})

electron.on('exit', (code) => {
  clearTimeout(timeout)

  if (!ready || code !== 0) {
    process.stderr.write(`Desktop Shell exited before a successful startup smoke (code ${code}).\n${output}`)
    process.exitCode = 1
    return
  }

  process.stdout.write('Desktop Shell startup smoke passed.\n')
})
