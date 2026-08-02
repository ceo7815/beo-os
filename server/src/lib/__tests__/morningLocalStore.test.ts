import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('morning local store — בלי Firestore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'morning-store-'))
    vi.resetModules()
    vi.doMock('../../config/env.js', () => ({
      env: {
        morningDataDir: dir,
        morning: { keyId: '', keySecret: '', env: 'production' },
        adminEmails: [],
      },
    }))
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../../config/env.js')
  })

  it('שומר וקורא מפתחות מהדיסק', async () => {
    const { writeLocalCredentials, readLocalCredentials } = await import(
      '../morningLocalStore.js'
    )
    await writeLocalCredentials({
      keyId: 'kid-1',
      keySecret: 'secret-1',
      env: 'production',
    })
    const creds = await readLocalCredentials()
    expect(creds).toEqual({
      keyId: 'kid-1',
      keySecret: 'secret-1',
      env: 'production',
    })
    const raw = await readFile(path.join(dir, 'morning-integration.json'), 'utf8')
    expect(raw).toContain('kid-1')
  })

  it('שומר מצב סנכרון בנפרד מהמפתחות', async () => {
    const {
      writeLocalCredentials,
      writeLocalSyncState,
      readLocalSyncState,
      readLocalCredentials,
    } = await import('../morningLocalStore.js')
    await writeLocalCredentials({
      keyId: 'a',
      keySecret: 'b',
      env: 'sandbox',
    })
    await writeLocalSyncState({ lastImported: 12, lastSyncAt: '2026-08-02T10:00:00.000Z' })
    expect(await readLocalCredentials()).toMatchObject({ keyId: 'a' })
    expect(await readLocalSyncState()).toMatchObject({ lastImported: 12 })
  })
})
