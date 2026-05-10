import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface StoredSecret {
  secretRef: string
  maskedValue: string
}

export interface SecretService {
  saveSecret(input: { runtimeConfigId: string; secretKind: string; value: string }): StoredSecret
  deleteSecret(secretRef: string): void
}

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '••••'
  }

  return `${value.slice(0, 2)}••••${value.slice(-2)}`
}

export class FileSecretService implements SecretService {
  constructor(private readonly rootDir: string) {}

  saveSecret(input: { runtimeConfigId: string; secretKind: string; value: string }): StoredSecret {
    const secretRef = `runtime/${input.runtimeConfigId}/${input.secretKind}/${randomUUID()}`
    const filePath = this.pathForRef(secretRef)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, this.encrypt(input.value), { mode: 0o600 })

    return {
      secretRef,
      maskedValue: maskSecret(input.value)
    }
  }

  deleteSecret(secretRef: string): void {
    rmSync(this.pathForRef(secretRef), { force: true })
  }

  readSecret(secretRef: string): string {
    const encrypted = readFileSync(this.pathForRef(secretRef))
    return this.decrypt(encrypted)
  }

  private pathForRef(secretRef: string): string {
    return join(this.rootDir, `${secretRef}.secret`)
  }

  private encrypt(value: string): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value)
    }

    return Buffer.from(value, 'utf8')
  }

  private decrypt(value: Buffer): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(value)
    }

    return value.toString('utf8')
  }
}

export class MemorySecretService implements SecretService {
  private readonly values = new Map<string, string>()

  saveSecret(input: { runtimeConfigId: string; secretKind: string; value: string }): StoredSecret {
    const secretRef = `memory/${input.runtimeConfigId}/${input.secretKind}/${randomUUID()}`
    this.values.set(secretRef, input.value)

    return {
      secretRef,
      maskedValue: maskSecret(input.value)
    }
  }

  deleteSecret(secretRef: string): void {
    this.values.delete(secretRef)
  }

  readSecret(secretRef: string): string | undefined {
    return this.values.get(secretRef)
  }
}
