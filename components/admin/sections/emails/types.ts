export const EMAIL_EVENT_STATUS_OPTIONS = [
  'all',
  'pending',
  'sent',
  'failed',
  'external_observed',
] as const

export const EMAIL_EVENT_PROVIDER_OPTIONS = [
  'all',
  'resend',
  'stripe',
  'supabase_auth',
] as const

export const EMAIL_EVENT_KEY_OPTIONS = [
  'all',
  'guest_otp',
  'order_confirmation',
  'final_delivery',
  'logistics_update',
  'unpaid_reminder',
  'stripe_receipt',
  'supabase_signup_otp',
] as const

export type EmailEventStatus = (typeof EMAIL_EVENT_STATUS_OPTIONS)[number]
export type EmailEventProvider = (typeof EMAIL_EVENT_PROVIDER_OPTIONS)[number]
export type EmailEventKey = (typeof EMAIL_EVENT_KEY_OPTIONS)[number]

export type EmailEventFilters = {
  status: EmailEventStatus
  provider: EmailEventProvider
  emailKey: EmailEventKey
}

export type EmailEventRow = {
  email_event_id: string
  email_key: string
  provider: string
  status: string
  to_email: string | null
  subject: string | null
  order_id: string | null
  final_job_id: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  failed_at: string | null
  observed_at: string | null
}

function normalizeOption<T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] {
  const normalized = typeof value === 'string' ? value : ''
  return (options.includes(normalized) ? normalized : 'all') as T[number]
}

export function normalizeEmailEventFilters(values: {
  status?: unknown
  provider?: unknown
  emailKey?: unknown
}): EmailEventFilters {
  return {
    status: normalizeOption(values.status, EMAIL_EVENT_STATUS_OPTIONS),
    provider: normalizeOption(values.provider, EMAIL_EVENT_PROVIDER_OPTIONS),
    emailKey: normalizeOption(values.emailKey, EMAIL_EVENT_KEY_OPTIONS),
  }
}

export function areEmailEventFiltersEqual(
  left: EmailEventFilters,
  right: EmailEventFilters
) {
  return (
    left.status === right.status &&
    left.provider === right.provider &&
    left.emailKey === right.emailKey
  )
}
