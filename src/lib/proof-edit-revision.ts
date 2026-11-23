export function proofEditRevision(book?: { proof_revision?: number; proof_draft_open?: boolean; proof_draft_sequence?: number } | null) {
  const published = book?.proof_revision ?? 1
  return book?.proof_draft_open ? Math.max(published + 1, book.proof_draft_sequence ?? 0) : published
}
