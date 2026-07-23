export type ReviewVersion = 'pdf' | 'print'
export type ReviewPendingAction = 'approve' | 'needs_fix' | 'approve_all'
export type ReviewPendingState = Record<
  string,
  { action: ReviewPendingAction; intentId: string }
>
export type UploadPendingKind = 'replacement' | 'print'
export type UploadPendingState = Record<string, UploadPendingKind>
