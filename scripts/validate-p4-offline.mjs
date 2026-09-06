import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`P4-A1 offline validation failed: ${message}`)
  }
}

const localDb = await read('apps/web/src/offline/local-db.ts')
const types = await read('apps/web/src/offline/types.ts')
const ids = await read('apps/web/src/offline/ids.ts')
const syncService = await read('apps/web/src/offline/sync-service.ts')
const syncReact = await read('apps/web/src/offline/sync-react.tsx')

const LOCAL_DB_PREFIX = 'fieldrep-os-offline'

console.log('P4-A1 offline foundation invariants:')

// §4 — local store must be partitioned by user/workspace/version.
assert(localDb.includes('encodeURIComponent'), 'database name must be built from encoded partition parts')
assert(localDb.includes(LOCAL_DB_PREFIX), 'database prefix must be stable')
assert(/(user_id|userId).*workspace|partition/.test(localDb), 'store must be namespaced per user + workspace')
assert(localDb.includes('LOCAL_STORE_VERSION'), 'local store must carry a schema version')
console.log('  ok — partitioned namespace (userId + workspaceId + local_store_version)')

// §21 — updates must never wipe pending data implicitly.
assert(localDb.includes('LocalSchemaMismatchError'), 'missing-migration upgrade must fail loudly, not wipe')
assert(!localDb.includes('deleteObjectStore'), 'never delete object stores as a routine upgrade technique')
assert(localDb.includes('clearAll'), 'explicit logout/prune path must exist')
console.log('  ok — upgrade safety (no silent wipe; explicit clearAll only)')

// §6 — stable client operation identity model.
for (const token of ['operationId', 'clientInstanceId', 'entityType', 'entityId', 'operationType', 'clientOccurredAt', 'payload', 'status', 'retryCount']) {
  assert(ids.includes('createOperationId'), `operation id generator missing (${token})`)
  assert(types.includes(token), `sync operation model must carry ${token}`)
}
assert(syncService.includes("'superseded'"), 'superseded status must be modeled')
console.log('  ok — SyncOperation envelope + superseded modeling')

// §20 — required user-visible states (validated through the shipped Persian labels).
assert(syncReact.includes('همگام شده'), 'synced Persian label must exist')
assert(syncReact.includes('ذخیره روی دستگاه'), 'offline saved-on-device Persian label must exist')
assert(syncReact.includes('در انتظار همگام'), 'pending Persian label must exist')
assert(syncReact.includes('تناقض'), 'conflict Persian label must exist')
assert(syncReact.includes('خطا در همگام'), 'failed Persian label must exist')
console.log('  ok — UI sync states (synced/offline/pending/conflict/failed)')

// §24 — UI must not implement transport logic.
assert(syncService.includes('SyncTransport'), 'sync transport must be injectable')
assert(!syncService.includes('navigator.serviceWorker'), 'queue must not depend on Service Worker lifecycle')
console.log('  ok — injectable transport, SW-independent queue')
console.log('P4-A1 offline structural/source validation: PASS')