import type { SuggestionDecision, VisitSuggestion } from '@fieldrep/domain'

/**
 * Pure suggestion-state reducer (P7-A3). The AI page stores one flat list of
 * suggestions; each explicit user decision (via the domain §13 state machine)
 * replaces the matching entry. Unknown ids are ignored so stale UI events
 * cannot resurrect a suggestion the engine already closed.
 */
export function applySuggestionDecision(
  suggestions: readonly VisitSuggestion[],
  decision: SuggestionDecision,
): VisitSuggestion[] {
  return suggestions.map((suggestion) =>
    suggestion.id === decision.suggestionId
      ? { ...suggestion, status: decision.nextStatus }
      : suggestion,
  )
}

export function findSuggestion(
  suggestions: readonly VisitSuggestion[],
  suggestionId: string,
): VisitSuggestion | null {
  return suggestions.find((suggestion) => suggestion.id === suggestionId) ?? null
}