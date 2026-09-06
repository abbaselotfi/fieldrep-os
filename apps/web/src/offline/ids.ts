/**
 * Client identity + sortable operation identifiers (P4-A1).
 *
 * `operationId` is ULID-inspired: a fixed-width epoch-millisecond prefix keeps
 * ids lexicographically sortable (FIFO queue), the random suffix gives global
 * uniqueness across devices. The exact id format is intentionally local to the
 * offline module; the server treats it as an opaque idempotency key.
 */

export type RandomSource = (byteCount: number) => Uint8Array

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function defaultRandomSource(byteCount: number): Uint8Array {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(new Uint8Array(byteCount))
  }
  // Deterministic-enough fallback for environments without Web Crypto.
  const bytes = new Uint8Array(byteCount)
  for (let index = 0; index < byteCount; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

function encodeBase32(bytes: Uint8Array): string {
  let output = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += CROCKFORD_BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += CROCKFORD_BASE32[(value << (5 - bits)) & 31]
  }
  return output
}

const OPERATION_ID_TIME_DIGITS = 13
const OPERATION_ID_RANDOM_BYTES = 10

/**
 * Sortable globally-unique operation id.
 * Derived `sortableKey` sorts any two ids by creation time first.
 */
export function createOperationId(
  now = Date.now(),
  random: RandomSource = defaultRandomSource,
): string {
  const timePart = now.toString().padStart(OPERATION_ID_TIME_DIGITS, '0')
  const randomPart = encodeBase32(random(OPERATION_ID_RANDOM_BYTES))
  return `${timePart}${randomPart}`
}

export function isOperationId(value: string): boolean {
  return /^\d{13}[0-9A-Z]+$/.test(value)
}

const CLIENT_INSTANCE_ID_KEY = 'fieldrep-os.client-instance-id'

/**
 * Stable per-install identity. Persisted in localStorage so it survives
 * IndexedDB partition changes and app updates (but never crosses devices).
 */
export function getOrCreateClientInstanceId(
  random: RandomSource = defaultRandomSource,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string {
  if (storage !== null) {
    const existing = storage.getItem(CLIENT_INSTANCE_ID_KEY)
    if (existing !== null && existing !== '') return existing
    const created = `ci_${encodeBase32(random(16))}`
    storage.setItem(CLIENT_INSTANCE_ID_KEY, created)
    return created
  }
  return `ci_${encodeBase32(random(16))}`
}