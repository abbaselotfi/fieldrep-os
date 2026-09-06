/**
 * React wiring for the P4-A1 offline foundation.
 *
 * `OfflineSyncProvider` opens the partitioned local database for the active
 * partition (demo for now), listens to connectivity/visibility changes and
 * exposes a single `useOfflineSync()` hook. UI components never touch
 * IndexedDB transport logic directly (OFFLINE-SYNC-SPEC §24).
 *
 * The `SyncStatusPill` renders the user-visible states from SPEC §20:
 * synced / syncing / offline — saved on device / N changes pending /
 * conflict — action required / sync failed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { demoOfflinePartition } from './demo-partition'
import { getOrCreateClientInstanceId } from './ids'
import { openLocalDatabase, type LocalDatabaseDeps } from './local-db'
import { OfflineSyncService, type SyncTransport } from './sync-service'
import type { OfflinePartition, SyncState, SyncStatus } from './types'

export interface OfflineSyncContextValue {
  ready: boolean
  status: SyncStatus | null
  syncNow: () => Promise<void>
  clearLocalData: () => Promise<void>
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null)

interface OfflineSyncProviderProps {
  children: ReactNode
  partition?: OfflinePartition
  transport?: SyncTransport | null
  databaseDeps?: LocalDatabaseDeps
}

function defaultDatabaseDeps(): LocalDatabaseDeps {
  const database = typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : undefined
  return {
    indexedDB: database ?? (undefined as never),
    idbKeyRange: typeof IDBKeyRange !== 'undefined' ? IDBKeyRange : (undefined as never),
  }
}

export function OfflineSyncProvider({
  children,
  partition = demoOfflinePartition,
  transport = null,
  databaseDeps = defaultDatabaseDeps(),
}: OfflineSyncProviderProps) {
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const serviceRef = useRef<OfflineSyncService | null>(null)
  const transportRef = useRef<SyncTransport | null>(transport)
  transportRef.current = transport

  const refreshStatus = useCallback(async (isOnline: boolean) => {
    const service = serviceRef.current
    if (service === null) return
    const next = await service.getStatus(isOnline)
    setStatus(next)
  }, [])

  useEffect(() => {
    let disposed = false
    let db: Awaited<ReturnType<typeof openLocalDatabase>> | null = null
    void (async () => {
      try {
        db = await openLocalDatabase(databaseDeps, partition)
        if (disposed) {
          db.close()
          return
        }
        serviceRef.current = new OfflineSyncService(db, {
          clientInstanceId: getOrCreateClientInstanceId(),
        })
        setReady(true)
        await refreshStatus(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true)
      } catch (error) {
        // Offline capability degrades gracefully; the shell stays usable online.
        console.error('FieldRep OS offline store failed to open', error)
        setReady(false)
      }
    })()
    return () => {
      disposed = true
      db?.close()
      serviceRef.current = null
    }
  }, [partition, databaseDeps, refreshStatus])

  useEffect(() => {
    const onConnectivity = () => {
      void refreshStatus(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true)
      }
    }
    window.addEventListener('online', onConnectivity)
    window.addEventListener('offline', onConnectivity)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onConnectivity)
      window.removeEventListener('offline', onConnectivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshStatus])

  const syncNow = useCallback(async () => {
    const service = serviceRef.current
    if (service === null || !ready) return
    setStatus((current) => (current === null ? current : { ...current, state: 'syncing' }))
    const activeTransport = transportRef.current
    if (activeTransport !== null) {
      await service.pushPending(activeTransport)
    }
    await refreshStatus(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true)
  }, [ready, refreshStatus])

  const clearLocalData = useCallback(async () => {
    const service = serviceRef.current
    if (service === null) return
    await service.db.clearAll()
    await refreshStatus(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true)
  }, [refreshStatus])

  const value = useMemo<OfflineSyncContextValue>(
    () => ({ ready, status, syncNow, clearLocalData }),
    [ready, status, syncNow, clearLocalData],
  )

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>
}

export function useOfflineSync(): OfflineSyncContextValue {
  const value = useContext(OfflineSyncContext)
  if (value === null) {
    throw new Error('useOfflineSync must be used inside <OfflineSyncProvider>')
  }
  return value
}
export interface SyncPillPresentation {
  dotClass: string
  label: string
  badge?: number
  title: string
}

export function presentSyncStatus(status: SyncStatus | null, ready: boolean): SyncPillPresentation {
  if (!ready) {
    return { dotClass: 'bg-[var(--text-tertiary)]', label: 'همگام‌سازی محلی', title: 'فضای ذخیره محلی هنوز آماده نشده است' }
  }
  if (status === null) {
    return { dotClass: 'bg-[var(--text-tertiary)]', label: 'در حال آماده‌سازی', title: 'وضعیت همگام‌سازی در حال خوانده شدن است' }
  }

  const title = [
    status.online ? 'آنلاین' : 'آفلاین',
    status.pendingCount > 0 ? ` ${status.pendingCount.toLocaleString('fa-IR')} تغییر در صف` : '',
    status.conflictCount > 0 ? ` · ${status.conflictCount.toLocaleString('fa-IR')} تناقض` : '',
    status.failedCount > 0 ? ` · ${status.failedCount.toLocaleString('fa-IR')} خطا` : '',
  ].join('').trim()

  if (status.state === 'conflict') {
    return { dotClass: 'bg-[var(--danger)]', label: 'تناقض', badge: status.conflictCount, title }
  }
  if (status.state === 'failed') {
    return { dotClass: 'bg-[var(--danger)]', label: 'خطا در همگام‌سازی', badge: status.failedCount, title }
  }
  if (status.state === 'syncing') {
    return { dotClass: 'bg-[var(--accent-strong)] animate-pulse', label: 'در حال همگام‌سازی', title }
  }
  if (status.state === 'pending') {
    return { dotClass: 'bg-[var(--accent-strong)]', label: 'در انتظار همگام', badge: status.pendingCount, title }
  }
  if (status.state === 'offline') {
    return { dotClass: 'bg-[var(--warning)]', label: 'آفلاین — ذخیره روی دستگاه', badge: status.pendingCount, title }
  }
  return { dotClass: 'bg-[var(--success)]', label: 'همگام شده', title }
}

export function SyncStatusPill() {
  const { ready, status } = useOfflineSync()
  const presentation = presentSyncStatus(status, ready)
  const state = status?.state ?? 'offline'

  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)] sm:inline-flex"
      title={presentation.title}
      data-sync-state={state}
    >
      <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
      {presentation.label}
      {presentation.badge !== undefined && presentation.badge > 0 ? (
        <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[9px] font-black text-[var(--danger)]">
          {presentation.badge.toLocaleString('fa-IR')}
        </span>
      ) : null}
    </span>
  )
}

export type { SyncState }