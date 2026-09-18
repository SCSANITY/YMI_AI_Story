// Illustrative layout data only. Never persisted or advertised as customer feedback.
export function getBookReviewDesignSample(bookId: string) {
  const hash = Array.from(bookId).reduce((value, character) => (
    Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0
  ), 2166136261)
  return { rating: 4.5 + (hash % 6) / 10, count: 100 + (hash % 201) }
}
