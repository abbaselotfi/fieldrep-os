/**
 * Calendar-admin shared contracts (P9-A4).
 *
 * Used by both the database layer (repository) and the worker API layer
 * (narrow gateway) — kept in the domain package so both sides share one
 * definition without a workspace-database dependency from the worker.
 */

export type CalendarClosureLevel = 'company' | 'workspace'

export interface CreateCalendarClosureInput {
  id: string
  level: CalendarClosureLevel
  /** Canonical (Gregorian) date, `YYYY-MM-DD`. */
  canonicalDate: string
  label: string
  createdByUserId: string | null
}

export interface TargetsPolicy {
  /** Default required visit frequency per customer class key. */
  classFrequency: Record<string, number>
  /** Default daily visit target per rep (before class weighting). */
  defaultDailyTarget: number
  /** Max daily visits allowed (planner hard constraint). */
  maxDailyVisits: number
}

export const DEFAULT_TARGETS_POLICY: TargetsPolicy = {
  classFrequency: {},
  defaultDailyTarget: 6,
  maxDailyVisits: 10,
}

export function normalizeTargetsPolicy(value: unknown | string): TargetsPolicy {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  const source = (parsed ?? {}) as Partial<TargetsPolicy>
  const classFrequency: Record<string, number> = {}
  if (source.classFrequency !== undefined && typeof source.classFrequency === 'object') {
    for (const [key, raw] of Object.entries(source.classFrequency as Record<string, unknown>)) {
      classFrequency[key] = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0
    }
  }
  return {
    classFrequency,
    defaultDailyTarget: clampNonNegativeInt(source.defaultDailyTarget, DEFAULT_TARGETS_POLICY.defaultDailyTarget),
    maxDailyVisits: clampNonNegativeInt(source.maxDailyVisits, DEFAULT_TARGETS_POLICY.maxDailyVisits),
  }
}

function clampNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}
