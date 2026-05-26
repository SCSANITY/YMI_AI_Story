import { NextResponse } from 'next/server'
import {
  COOKIE_CONSENT_VERSION,
  normalizeCookieConsent,
  type CookieConsentPreferences,
} from '@/lib/cookie-consent'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type CustomerConsentRow = {
  customer_id: string
  cookie_consent: unknown
  cookie_consent_version: string | null
  cookie_consent_updated_at: string | null
}

function consentSelect() {
  return 'customer_id, cookie_consent, cookie_consent_version, cookie_consent_updated_at'
}

async function getAuthenticatedCustomer() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.id) return null

  const { data, error: customerError } = await supabaseAdmin
    .from('customers')
    .select(consentSelect())
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const customer = data as CustomerConsentRow | null
  if (customerError || !customer?.customer_id) return null
  return customer
}

export async function GET() {
  const customer = await getAuthenticatedCustomer()
  if (!customer?.customer_id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const consent = normalizeCookieConsent(customer.cookie_consent)
  return NextResponse.json({
    consent,
    version: customer.cookie_consent_version ?? consent?.version ?? COOKIE_CONSENT_VERSION,
    updatedAt: customer.cookie_consent_updated_at ?? consent?.updatedAt ?? null,
  })
}

export async function POST(request: Request) {
  const customer = await getAuthenticatedCustomer()
  if (!customer?.customer_id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const consent = normalizeCookieConsent(body?.consent) as CookieConsentPreferences | null

  if (!consent) {
    return NextResponse.json({ error: 'Invalid cookie consent preferences' }, { status: 400 })
  }

  const normalizedConsent: CookieConsentPreferences = {
    necessary: true,
    analytics: consent.analytics,
    marketing: consent.marketing,
    version: COOKIE_CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from('customers')
    .update({
      cookie_consent: normalizedConsent,
      cookie_consent_version: normalizedConsent.version,
      cookie_consent_updated_at: normalizedConsent.updatedAt,
      updated_at: normalizedConsent.updatedAt,
    })
    .eq('customer_id', customer.customer_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to save cookie consent' }, { status: 500 })
  }

  return NextResponse.json({ consent: normalizedConsent })
}
