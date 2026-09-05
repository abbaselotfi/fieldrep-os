import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceWorkbookImportRepository } from './workbook-import-repository'

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 6
  readonly batches: WorkspaceWriteCommand[][] = []

  constructor(private readonly existingId: string | null = null) {}

  async health(): Promise<boolean> { return true }
  async queryFirst<T>(): Promise<T | null> { return this.existingId === null ? null : ({ id: this.existingId } as T) }
  async queryAll<T>(): Promise<T[]> { return [] }
  async execute(): Promise<WorkspaceWriteResult> { return { success: true, changes: 1 } }
  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batches.push([...commands])
    return commands.map(() => ({ success: true, changes: 1 }))
  }
}

const preview = {
  sourceName: 'sample.xlsm',
  sourceSha256: 'a'.repeat(64),
  parserVersion: 'adapter-v1',
  routes: [{ naturalKey: 'route 8', name: 'Route 8' }],
  customers: [{
    naturalKey: 'doctor one',
    displayName: 'Doctor One',
    specialty: 'Internal',
    classKey: 'A',
    requiredFrequency: 6,
    routeNaturalKey: 'route 8',
    address: 'Mashhad',
    sourceRow: 2,
  }],
  products: [{ naturalKey: 'toujeo', name: 'Toujeo' }],
  visits: [{
    naturalKey: 'report:2',
    visitDate: '2026-09-06',
    customerNaturalKey: 'doctor one',
    productNaturalKeys: ['toujeo'],
    reportText: 'ok',
    sourceRow: 2,
  }],
  plans: [],
  issues: [],
  summary: { routes: 1, customers: 1, products: 1, visits: 1, plans: 0, warnings: 0, errors: 0, canApply: true },
} as const

describe('WorkspaceWorkbookImportRepository', () => {
  it('persists an import manifest and review rows atomically', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceWorkbookImportRepository(store, () => 123)

    const result = await repository.persistPreview({
      importId: 'import-1',
      createdByUserId: 'user-1',
      preview,
    })

    expect(result).toMatchObject({ importId: 'import-1', canApply: true, errors: 0 })
    expect(store.batches).toHaveLength(1)
    const commands = store.batches[0]!
    expect(commands[0]?.query).toContain('INSERT INTO workbook_imports')
    expect(commands.some((command) => command.query.includes('workbook_import_rows'))).toBe(true)
  })

  it('rejects the same workbook fingerprint instead of silently importing it twice', async () => {
    const repository = new WorkspaceWorkbookImportRepository(new FakeStore('import-existing'))

    await expect(repository.persistPreview({
      importId: 'import-new',
      createdByUserId: 'user-1',
      preview,
    })).rejects.toThrow('workbook_import_duplicate:import-existing')
  })
})
