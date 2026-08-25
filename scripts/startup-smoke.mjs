import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'

const readySignal = 'AGENT_SPACE_APP_READY'
const timeoutMs = 20_000
const electronEnvironment = { ...process.env }
const packaged = process.argv.includes('--packaged') || electronEnvironment.AGENT_SPACE_PACKAGED_SMOKE === '1'

delete electronEnvironment.ELECTRON_RUN_AS_NODE

const distEntries = packaged ? await readdir(join(process.cwd(), 'dist')) : []
const findUnpackedDirectory = (prefix, fallback) => distEntries.find((entry) => entry.startsWith(prefix) && entry.includes('unpacked')) ?? fallback
const macBuildDirectory = process.platform === 'darwin'
  ? distEntries.find((entry) => entry.startsWith('mac-') || entry === 'mac') ?? 'mac'
  : 'mac'
const packagedExecutable = process.platform === 'darwin'
  ? join(process.cwd(), 'dist', macBuildDirectory, 'Agent Space.app', 'Contents', 'MacOS', 'Agent Space')
  : process.platform === 'win32'
    ? join(process.cwd(), 'dist', findUnpackedDirectory('win', 'win-unpacked'), 'Agent Space.exe')
    : join(process.cwd(), 'dist', findUnpackedDirectory('linux', 'linux-unpacked'), 'agent-space')
const userDataDirectory = await mkdtemp(join(tmpdir(), 'agent-space-smoke-'))
const executable = packaged ? packagedExecutable : electronPath
const args = packaged ? [`--user-data-dir=${userDataDirectory}`] : ['out/main/index.js']
const electron = spawn(executable, args, {
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
  void rm(userDataDirectory, { recursive: true, force: true })
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
  void rm(userDataDirectory, { recursive: true, force: true })
  process.stderr.write(`Failed to launch Desktop Shell: ${error.message}\n`)
  process.exitCode = 1
})

electron.on('exit', (code) => {
  clearTimeout(timeout)
  void rm(userDataDirectory, { recursive: true, force: true })

  if (!ready || code !== 0) {
    process.stderr.write(`Desktop Shell exited before a successful startup smoke (code ${code}).\n${output}`)
    process.exitCode = 1
    return
  }

  process.stdout.write('Desktop Shell startup smoke passed.\n')
})
