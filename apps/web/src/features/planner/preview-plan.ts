import { demoWeekPlan, getDemoCustomer } from '../../data/demo-field-workspace'

export type PreviewPlanStatus = 'planned' | 'cancelled'

export interface PreviewPlanEntry {
  id: string
  customerId: string
  planDate: string
  route: string
  status: PreviewPlanStatus
  source: 'manual' | 'seed'
}

export interface PreviewPlannerDay {
  planDate: string
  jalaliDay: number
  weekday: string
  route: string
  target: number
}

export interface PreviewPlanDraft {
  customerId: string
  planDate: string
}

export type PreviewPlanMutationError = 'duplicate_same_day' | 'day_not_available'

export interface PreviewPlanMutationResult {
  entries: PreviewPlanEntry[]
  error: PreviewPlanMutationError | null
}

const canonicalDates = [
  '2026-09-06',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
] as const

export const previewPlannerDays: readonly PreviewPlannerDay[] = demoWeekPlan.map((day, index) => ({
  planDate: canonicalDates[index]!,
  jalaliDay: day.day,
  weekday: day.weekday,
  route: day.route,
  target: day.target,
}))

export function createPreviewPlanSeed(): PreviewPlanEntry[] {
  return demoWeekPlan.flatMap((day, dayIndex) => {
    const planDate = canonicalDates[dayIndex]!
    return day.customerIds.map((customerId, customerIndex) => ({
      id: `preview-${planDate}-${customerId}-${customerIndex}`,
      customerId,
      planDate,
      route: getDemoCustomer(customerId).route,
      status: 'planned' as const,
      source: 'seed' as const,
    }))
  })
}

export function activePreviewPlans(entries: readonly PreviewPlanEntry[]): PreviewPlanEntry[] {
  return entries.filter((entry) => entry.status === 'planned')
}

export function previewPlansForDate(
  entries: readonly PreviewPlanEntry[],
  planDate: string,
): PreviewPlanEntry[] {
  return activePreviewPlans(entries).filter((entry) => entry.planDate === planDate)
}

export function previewDayProgress(
  entries: readonly PreviewPlanEntry[],
  planDate: string,
): { planned: number; target: number; remaining: number; overBy: number } {
  const day = previewPlannerDays.find((candidate) => candidate.planDate === planDate)
  const target = day?.target ?? 0
  const planned = previewPlansForDate(entries, planDate).length
  return {
    planned,
    target,
    remaining: Math.max(target - planned, 0),
    overBy: Math.max(planned - target, 0),
  }
}

export function previewAdjacentDuplicateDates(
  entries: readonly PreviewPlanEntry[],
  draft: PreviewPlanDraft,
  ignoredEntryId?: string,
): string[] {
  const candidateTime = canonicalDay(draft.planDate)
  return activePreviewPlans(entries)
    .filter(
      (entry) =>
        entry.id !== ignoredEntryId &&
        entry.customerId === draft.customerId &&
        Math.abs(canonicalDay(entry.planDate) - candidateTime) === 86_400_000,
    )
    .map((entry) => entry.planDate)
}

export function createPreviewPlan(
  entries: readonly PreviewPlanEntry[],
  draft: PreviewPlanDraft,
  id: string,
): PreviewPlanMutationResult {
  if (!previewPlannerDays.some((day) => day.planDate === draft.planDate)) {
    return { entries: [...entries], error: 'day_not_available' }
  }

  if (hasSameDayDuplicate(entries, draft)) {
    return { entries: [...entries], error: 'duplicate_same_day' }
  }

  const customer = getDemoCustomer(draft.customerId)
  return {
    entries: [
      ...entries,
      {
        id,
        customerId: draft.customerId,
        planDate: draft.planDate,
        route: customer.route,
        status: 'planned',
        source: 'manual',
      },
    ],
    error: null,
  }
}

export function updatePreviewPlan(
  entries: readonly PreviewPlanEntry[],
  entryId: string,
  draft: PreviewPlanDraft,
): PreviewPlanMutationResult {
  if (!previewPlannerDays.some((day) => day.planDate === draft.planDate)) {
    return { entries: [...entries], error: 'day_not_available' }
  }

  if (hasSameDayDuplicate(entries, draft, entryId)) {
    return { entries: [...entries], error: 'duplicate_same_day' }
  }

  const customer = getDemoCustomer(draft.customerId)
  return {
    entries: entries.map((entry) =>
      entry.id === entryId && entry.status === 'planned'
        ? {
            ...entry,
            customerId: draft.customerId,
            planDate: draft.planDate,
            route: customer.route,
          }
        : entry,
    ),
    error: null,
  }
}

export function cancelPreviewPlan(
  entries: readonly PreviewPlanEntry[],
  entryId: string,
): PreviewPlanEntry[] {
  return entries.map((entry) =>
    entry.id === entryId && entry.status === 'planned'
      ? { ...entry, status: 'cancelled' }
      : entry,
  )
}

function hasSameDayDuplicate(
  entries: readonly PreviewPlanEntry[],
  draft: PreviewPlanDraft,
  ignoredEntryId?: string,
): boolean {
  return activePreviewPlans(entries).some(
    (entry) =>
      entry.id !== ignoredEntryId &&
      entry.customerId === draft.customerId &&
      entry.planDate === draft.planDate,
  )
}

function canonicalDay(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`)
}
