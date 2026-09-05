import { describe, expect, it } from 'vitest'

import {
  cancelOwnLeaveRequest,
  decideLeaveRequest,
  leaveBlocksPlanning,
  leaveToCalendarItem,
  submitLeaveRequest,
  validateLeaveRequest,
  type LeaveRequest,
} from './leave'

function leave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'leave-1',
    workspaceId: 'workspace-a',
    userId: 'user-1',
    type: 'annual',
    startsAt: Date.UTC(2026, 8, 6, 0),
    endsAt: Date.UTC(2026, 8, 6, 23, 59),
    localStartDate: '2026-09-06',
    localEndDate: '2026-09-06',
    allDay: true,
    reason: 'کار شخصی',
    status: 'draft',
    decidedByUserId: null,
    decidedAt: null,
    ...overrides,
  }
}

describe('leave lifecycle', () => {
  it('submits only a draft leave', () => {
    expect(submitLeaveRequest(leave()).status).toBe('requested')
    expect(() => submitLeaveRequest(leave({ status: 'requested' }))).toThrow(
      'only draft leave can be requested',
    )
  })

  it('requires an audited approver decision and only decides requested leave', () => {
    const requested = submitLeaveRequest(leave())
    const approved = decideLeaveRequest(requested, 'approved', 'supervisor-1', 1_780_000_000_000)

    expect(approved).toMatchObject({
      status: 'approved',
      decidedByUserId: 'supervisor-1',
      decidedAt: 1_780_000_000_000,
    })
    expect(() => decideLeaveRequest(leave(), 'approved', 'supervisor-1', 1)).toThrow(
      'only requested leave can be decided',
    )
  })

  it('allows owner cancellation only while draft/requested', () => {
    expect(cancelOwnLeaveRequest(leave()).status).toBe('cancelled')
    expect(cancelOwnLeaveRequest(submitLeaveRequest(leave())).status).toBe('cancelled')
    expect(() =>
      cancelOwnLeaveRequest(
        decideLeaveRequest(submitLeaveRequest(leave()), 'approved', 'supervisor-1', 1),
      ),
    ).toThrow('only draft or requested leave can be cancelled by owner')
  })

  it('only approved leave is a hard planning blocker', () => {
    const draft = leave()
    const requested = submitLeaveRequest(draft)
    const approved = decideLeaveRequest(requested, 'approved', 'supervisor-1', 1)
    const rejected = decideLeaveRequest(requested, 'rejected', 'supervisor-1', 2)

    expect(leaveBlocksPlanning(draft)).toBe(false)
    expect(leaveBlocksPlanning(requested)).toBe(false)
    expect(leaveBlocksPlanning(rejected)).toBe(false)
    expect(leaveBlocksPlanning(approved)).toBe(true)
  })

  it('projects leave to Calendar without visit KPI semantics', () => {
    const approved = decideLeaveRequest(
      submitLeaveRequest(leave({ type: 'sick' })),
      'approved',
      'supervisor-1',
      1,
    )
    const item = leaveToCalendarItem(approved, 'calendar-leave-1')

    expect(item).toMatchObject({
      type: 'leave',
      sourceType: 'leave_request',
      title: 'مرخصی استعلاجی',
      scope: { type: 'user', id: 'user-1' },
      behavior: {
        blocksPlanning: true,
        countsAsWorkingActivity: false,
        countsAsVisit: false,
        appearsInReport: true,
      },
      status: 'active',
    })
  })

  it('rejects invalid ranges and unaudited decided status', () => {
    expect(() => validateLeaveRequest(leave({ localEndDate: '2026-09-05' }))).toThrow(
      'leave local end date must not precede local start date',
    )
    expect(() => validateLeaveRequest(leave({ status: 'approved' }))).toThrow(
      'decided leave requires decision audit fields',
    )
  })
})
