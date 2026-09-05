import type { CalendarItem } from './calendar-contracts'
import type {
  BusinessTripDestinationId,
  BusinessTripId,
  CalendarEventId,
  UserId,
  WorkspaceId,
} from './identity'
import { canonicalDateToPersian } from './persian-calendar'

export type BusinessTripStatus =
  | 'draft'
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'

export type BusinessTripTransport =
  | 'car'
  | 'train'
  | 'airplane'
  | 'bus'
  | 'taxi'
  | 'other'

export interface BusinessTripDestination {
  id: BusinessTripDestinationId
  sequence: number
  city: string
  province: string | null
  address: string | null
  startsAt: number | null
  endsAt: number | null
}

export interface BusinessTrip {
  id: BusinessTripId
  workspaceId: WorkspaceId
  userId: UserId
  originCity: string
  originProvince: string | null
  purpose: string
  transport: BusinessTripTransport
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  blocksPlanning: boolean
  status: BusinessTripStatus
  destinations: readonly BusinessTripDestination[]
  decidedByUserId: UserId | null
  decidedAt: number | null
}

export function validateBusinessTrip(trip: BusinessTrip): void {
  if (trip.originCity.trim() === '') throw new RangeError('business trip origin city is required')
  if (trip.purpose.trim() === '') throw new RangeError('business trip purpose is required')
  if (!Number.isFinite(trip.startsAt) || !Number.isFinite(trip.endsAt)) {
    throw new RangeError('business trip timestamps must be finite')
  }
  if (trip.endsAt < trip.startsAt) throw new RangeError('business trip end must not precede start')
  canonicalDateToPersian(trip.localStartDate)
  canonicalDateToPersian(trip.localEndDate)
  if (trip.localEndDate < trip.localStartDate) {
    throw new RangeError('business trip local end date must not precede local start date')
  }
  if (trip.destinations.length === 0) throw new RangeError('business trip requires a destination')

  const ids = new Set<string>()
  const sequences = new Set<number>()
  for (const destination of trip.destinations) {
    if (destination.id.trim() === '') throw new RangeError('business trip destination id is required')
    if (ids.has(destination.id)) throw new RangeError('duplicate business trip destination id')
    ids.add(destination.id)
    if (!Number.isInteger(destination.sequence) || destination.sequence < 1) {
      throw new RangeError('business trip destination sequence must be a positive integer')
    }
    if (sequences.has(destination.sequence)) {
      throw new RangeError('duplicate business trip destination sequence')
    }
    sequences.add(destination.sequence)
    if (destination.city.trim() === '') throw new RangeError('business trip destination city is required')
    if ((destination.startsAt === null) !== (destination.endsAt === null)) {
      throw new RangeError('business trip destination interval must be complete or omitted')
    }
    if (
      destination.startsAt !== null &&
      destination.endsAt !== null &&
      (!Number.isFinite(destination.startsAt) ||
        !Number.isFinite(destination.endsAt) ||
        destination.endsAt < destination.startsAt ||
        destination.startsAt < trip.startsAt ||
        destination.endsAt > trip.endsAt)
    ) {
      throw new RangeError('business trip destination interval must be inside trip range')
    }
  }

  const hasDecision = trip.status === 'approved' || trip.status === 'rejected' || trip.status === 'completed'
  if (hasDecision) {
    if (trip.decidedByUserId === null || trip.decidedAt === null) {
      throw new RangeError('decided business trip requires audit fields')
    }
  } else if (trip.decidedByUserId !== null || trip.decidedAt !== null) {
    throw new RangeError('undecided business trip must not carry decision audit fields')
  }
}

export function requestBusinessTrip(trip: BusinessTrip): BusinessTrip {
  validateBusinessTrip(trip)
  if (trip.status !== 'draft') throw new Error('only draft business trip can be requested')
  return { ...trip, status: 'requested' }
}

export function decideBusinessTrip(
  trip: BusinessTrip,
  decision: 'approved' | 'rejected',
  decidedByUserId: UserId,
  decidedAt: number,
): BusinessTrip {
  validateBusinessTrip(trip)
  if (trip.status !== 'requested') throw new Error('only requested business trip can be decided')
  if (decidedByUserId.trim() === '') throw new Error('business trip decision actor is required')
  if (!Number.isFinite(decidedAt)) throw new RangeError('business trip decision timestamp must be finite')
  const decided: BusinessTrip = {
    ...trip,
    status: decision,
    decidedByUserId,
    decidedAt,
  }
  validateBusinessTrip(decided)
  return decided
}

export function cancelOwnBusinessTrip(trip: BusinessTrip): BusinessTrip {
  validateBusinessTrip(trip)
  if (trip.status !== 'draft' && trip.status !== 'requested') {
    throw new Error('only draft or requested business trip can be cancelled by owner')
  }
  return { ...trip, status: 'cancelled' }
}

export function completeBusinessTrip(trip: BusinessTrip): BusinessTrip {
  validateBusinessTrip(trip)
  if (trip.status !== 'approved') throw new Error('only approved business trip can be completed')
  const completed: BusinessTrip = { ...trip, status: 'completed' }
  validateBusinessTrip(completed)
  return completed
}

export function businessTripBlocksPlanning(trip: BusinessTrip): boolean {
  return trip.status === 'approved' && trip.blocksPlanning
}

export function businessTripToCalendarItem(
  trip: BusinessTrip,
  calendarEventId: CalendarEventId,
): CalendarItem {
  validateBusinessTrip(trip)
  const destinationLabel = trip.destinations.map((destination) => destination.city).join('، ')
  return {
    id: calendarEventId,
    workspaceId: trip.workspaceId,
    type: 'business_trip',
    sourceType: 'business_trip',
    sourceId: trip.id,
    title: `ماموریت ${destinationLabel}`,
    startsAt: trip.startsAt,
    endsAt: trip.endsAt,
    localStartDate: trip.localStartDate,
    localEndDate: trip.localEndDate,
    allDay: trip.allDay,
    scope: { type: 'user', id: trip.userId },
    attendeeUserIds: [trip.userId],
    behavior: {
      blocksPlanning: businessTripBlocksPlanning(trip),
      countsAsWorkingActivity: trip.status === 'approved' || trip.status === 'completed',
      countsAsVisit: false,
      appearsInReport: trip.status !== 'cancelled' && trip.status !== 'rejected',
    },
    status: calendarStatus(trip.status),
    locationText: destinationLabel,
  }
}

function calendarStatus(status: BusinessTripStatus): CalendarItem['status'] {
  switch (status) {
    case 'draft': return 'draft'
    case 'requested': return 'scheduled'
    case 'approved': return 'active'
    case 'completed': return 'completed'
    case 'rejected':
    case 'cancelled': return 'cancelled'
  }
}
