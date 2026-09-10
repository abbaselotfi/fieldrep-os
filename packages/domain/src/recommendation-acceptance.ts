import type { VisitSuggestion } from './recommendation-suggestion'

/**
 * Acceptance workflow (AI-PLANNER-SPEC §13).
 *
 * Only explicit user decisions move a suggestion forward, and every accepted
 * or edited decision produces a plan seed carrying provenance
 * (`source = ai_suggestion`) so plan entries remain auditable. Nothing here
 * publishes an official plan by itself — conversion stays a user action.
 */
export type SuggestionAction = 'accept' | 'reject' | 'edit'

export interface AcceptedPlanSeed {
  suggestionId: string
  customerId: string
  planDate: string
  locationId?: string
  source: 'ai_suggestion'
  sourceSuggestionId: string
}

export interface SuggestionDecision {
  suggestionId: string
  action: SuggestionAction
  nextStatus: VisitSuggestion['status']
  planSeed: AcceptedPlanSeed | null
}

export interface DecideSuggestionInput {
  suggestion: VisitSuggestion
  action: SuggestionAction
  /** Required for `edit`: the user's adjusted date. */
  editedDate?: string
  /** Optional for `edit`: the user's adjusted location. */
  editedLocationId?: string
}

export class SuggestionDecisionError extends Error {
  constructor(
    readonly code:
      | 'suggestion_not_open'
      | 'edit_requires_changes'
      | 'invalid_edited_date',
  ) {
    super(`suggestion_decision_failed:${code}`)
    this.name = 'SuggestionDecisionError'
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isEditableStatus(status: VisitSuggestion['status']): boolean {
  return status === 'suggested' || status === 'edited'
}

export function decideSuggestion(input: DecideSuggestionInput): SuggestionDecision {
  const { suggestion, action } = input

  if (action === 'reject') {
    return {
      suggestionId: suggestion.id,
      action,
      nextStatus: 'rejected',
      planSeed: null,
    }
  }

  if (!isEditableStatus(suggestion.status)) {
    throw new SuggestionDecisionError('suggestion_not_open')
  }

  if (action === 'accept') {
    return {
      suggestionId: suggestion.id,
      action,
      nextStatus: 'accepted',
      planSeed: buildSeed(suggestion, suggestion.suggestedDate, suggestion.suggestedLocationId),
    }
  }

  // edit: at least one field must actually change.
  const dateChanged = input.editedDate !== undefined && input.editedDate !== suggestion.suggestedDate
  const locationChanged =
    input.editedLocationId !== undefined && input.editedLocationId !== suggestion.suggestedLocationId
  if (!dateChanged && !locationChanged) {
    throw new SuggestionDecisionError('edit_requires_changes')
  }
  if (dateChanged && (input.editedDate === undefined || !DATE_PATTERN.test(input.editedDate))) {
    throw new SuggestionDecisionError('invalid_edited_date')
  }

  return {
    suggestionId: suggestion.id,
    action,
    nextStatus: 'edited',
    planSeed: buildSeed(
      suggestion,
      input.editedDate ?? suggestion.suggestedDate,
      input.editedLocationId ?? suggestion.suggestedLocationId,
    ),
  }
}

function buildSeed(
  suggestion: VisitSuggestion,
  planDate: string,
  locationId: string | undefined,
): AcceptedPlanSeed {
  const seed: AcceptedPlanSeed = {
    suggestionId: suggestion.id,
    customerId: suggestion.customerId,
    planDate,
    source: 'ai_suggestion',
    sourceSuggestionId: suggestion.id,
  }
  if (locationId !== undefined) seed.locationId = locationId
  return seed
}