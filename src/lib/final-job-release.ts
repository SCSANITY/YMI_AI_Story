export type FinalJobReleaseLike = {
  released_at?: string | null
  review_status?: string | null
}

export function isFinalJobReleased(finalJob: FinalJobReleaseLike | null | undefined) {
  return Boolean(finalJob?.released_at || finalJob?.review_status === 'released')
}
