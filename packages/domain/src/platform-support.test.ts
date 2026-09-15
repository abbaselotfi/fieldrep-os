import { describe, expect, it } from 'vitest'

import {
  buildPlatformUsageOverview,
  isSupportAccessActive,
  isSupportAccessStatus,
  SUPPORT_ACCESS_DECISION_EVENTS,
  validateSupportAccessTransition,
  type SupportAccessGrant,
} from './platform-support'

const grant = (overrides: Partial<SupportAccessGrant> = {}): SupportAccessGrant => ({
  id: 'g1',
  workspaceId: 'w1',
  requestedByUserId: 'admin-1',
  reason: 'support investigation',
  status: 'requested',
  requestedAt: 1000,
  decidedAt: null,
  decidedByUserId: null,
  expiresAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
})

describe('validateSupportAccessTransition', () => {
  it('allows requested → approve/deny', () => {
    expect(validateSupportAccessTransition('requested', 'approve')).toBe('ok')
    expect(validateSupportAccessTransition('requested', 'deny')).toBe('ok')
  })

  it('allows approved → revoke/expire', () => {
    expect(validateSupportAccessTransition('approved', 'revoke')).toBe('ok')
    expect(validateSupportAccessTransition('approved', 'expire')).toBe('ok')
  })

  it('rejects terminal-state transitions (immutable audit history)', () => {
    for (const status of ['denied', 'revoked', 'expired'] as const) {
      for (const decision of ['approve', 'deny', 'revoke', 'expire'] as const) {
        expect(validateSupportAccessTransition(status, decision)).toBe('invalid_transition')
      }
    }
  })

  it('rejects invalid requested/approved paths', () => {
    expect(validateSupportAccessTransition('requested', 'revoke')).toBe('invalid_transition')
    expect(validateSupportAccessTransition('requested', 'expire')).toBe('invalid_transition')
    expect(validateSupportAccessTransition('approved', 'approve')).toBe('invalid_transition')
  })
})

describe('isSupportAccessActive', () => {
  it('is true only for an approved grant', () => {
    expect(isSupportAccessActive(grant({ status: 'approved' }), 2000)).toBe(true)
    expect(isSupportAccessActive(grant({ status: 'requested' }), 2000)).toBe(false)
    expect(isSupportAccessActive(grant({ status: 'revoked' }), 2000)).toBe(false)
  })

  it('fails closed on expiry', () => {
    expect(isSupportAccessActive(grant({ status: 'approved', expiresAt: 5000 }), 5000)).toBe(false)
    expect(isSupportAccessActive(grant({ status: 'approved', expiresAt: 5000 }), 4999)).toBe(true)
  })
})

describe('support access support bits', () => {
  it('maps decisions to audit action keys', () => {
    expect(SUPPORT_ACCESS_DECISION_EVENTS.approve).toBe('support_access.approved')
    expect(SUPPORT_ACCESS_DECISION_EVENTS.revoke).toBe('support_access.revoked')
  })

  it('accepts only known statuses', () => {
    expect(isSupportAccessStatus('requested')).toBe(true)
    expect(isSupportAccessStatus('paused')).toBe(false)
  })
})

describe('buildPlatformUsageOverview', () => {
  it('aggregates status counts deterministically', () => {
    const overview = buildPlatformUsageOverview({
      companyStatuses: ['active', 'active', 'suspended', 'archived'],
      workspaceStatuses: ['active', 'suspended'],
      dataRouteStatuses: ['active', 'maintenance', 'disabled', 'active'],
    })
    expect(overview.companies).toEqual({ total: 4, active: 2, suspended: 1, archived: 1 })
    expect(overview.workspaces).toEqual({ total: 2, active: 1, suspended: 1, archived: 0 })
    expect(overview.dataRoutes).toEqual({ total: 4, active: 2, maintenance: 1, disabled: 1 })
  })

  it('handles empty inputs', () => {
    const overview = buildPlatformUsageOverview({
      companyStatuses: [],
      workspaceStatuses: [],
      dataRouteStatuses: [],
    })
    expect(overview.companies.total).toBe(0)
    expect(overview.dataRoutes.active).toBe(0)
  })
})