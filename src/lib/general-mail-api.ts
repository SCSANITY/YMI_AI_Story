export function classifyGeneralMailError(error: unknown, fallback: string) {
  const detail = error instanceof Error ? error.message : fallback
  if (detail.includes('not_found') || detail.includes('not found')) {
    return { status: 404, message: 'Mail item not found' }
  }
  if (
    detail.includes('stale')
    || detail.includes('locked')
    || detail.includes('conflict')
    || detail.includes('already')
    || detail.includes('not ready')
  ) {
    return { status: 409, message: detail }
  }
  if (
    detail.includes('invalid')
    || detail.includes('recipient')
    || detail.includes('mailbox')
    || detail.includes('not_allowed')
    || detail.includes('required')
    || detail.includes('too many')
    || detail.includes('too large')
    || detail.includes('size limit')
    || detail.includes('failed validation')
  ) {
    return { status: 400, message: detail }
  }
  if (detail.includes('[email]') || detail.includes('Resend') || detail.includes('send')) {
    return { status: 502, message: 'The email could not be sent' }
  }
  return { status: 500, message: fallback }
}
