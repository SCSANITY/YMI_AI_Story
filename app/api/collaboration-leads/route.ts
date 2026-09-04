import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CollaborationLeadCreatePayload } from '@/types'

const OPEN_REVIEW_STATUSES = ['new', 'reviewing', 'contacting', 'partnered']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AuthenticatedApplicant = {
  customerId: string
  accountEmail: string
}

function cleanOptional(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function cleanRequired(value: unknown, maxLength: number) {
  return cleanOptional(value, maxLength)
}

function parseAudienceSize(value: unknown) {
  const normalized = typeof value === 'string' ? value.replace(/[\s,]/g, '') : value
  const audienceSize = Number(normalized)
  if (!Number.isSafeInteger(audienceSize) || audienceSize < 0 || audienceSize > 1_000_000_000) {
    return null
  }
  return audienceSize
}

function isValidWebsite(value: string | null) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function resolveAuthenticatedApplicant(): Promise<
  | { applicant: AuthenticatedApplicant; response?: never }
  | { applicant?: never; response: NextResponse }
> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  const accountEmail = String(user?.email ?? '').trim().toLowerCase()
  if (authError || !user?.id || !accountEmail) {
    return {
      response: jsonNoStore({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (customerError) {
    return {
      response: jsonNoStore({ error: 'Unable to resolve your account' }, { status: 500 }),
    }
  }
  if (!customer?.customer_id || String(customer.email || '').trim().toLowerCase() !== accountEmail) {
    return {
      response: jsonNoStore(
        { error: 'Please finish signing in before submitting an application' },
        { status: 409 }
      ),
    }
  }

  return {
    applicant: {
      customerId: customer.customer_id,
      accountEmail,
    },
  }
}

export async function GET() {
  const auth = await resolveAuthenticatedApplicant()
  if (auth.response) return auth.response

  const { data, error } = await supabaseAdmin
    .from('kol_collaboration_leads')
    .select('lead_id, review_status, submitted_at')
    .eq('customer_id', auth.applicant.customerId)
    .in('review_status', OPEN_REVIEW_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return jsonNoStore({ error: 'Unable to load your partnership application' }, { status: 500 })
  }

  return jsonNoStore({ ok: true, application: data ?? null })
}

export async function POST(request: Request) {
  const auth = await resolveAuthenticatedApplicant()
  if (auth.response) return auth.response

  const body = (await request.json().catch(() => ({}))) as Partial<CollaborationLeadCreatePayload>
  const nickname = cleanRequired(body.nickname, 100)
  const contactEmail = cleanRequired(body.contact_email, 320)?.toLowerCase() ?? null
  const phone = cleanOptional(body.phone, 100)
  const whatsappOrWechat = cleanOptional(body.whatsapp_or_wechat, 200)
  const countryRegion = cleanRequired(body.country_region, 120)
  const primaryMarket = cleanRequired(body.primary_market, 200)
  const audienceSize = parseAudienceSize(body.audience_size)
  const contentFocus = cleanRequired(body.content_focus, 1200)
  const websiteUrl = cleanOptional(body.website_url, 500)
  const instagram = cleanOptional(body.instagram, 500)
  const tiktok = cleanOptional(body.tiktok, 500)
  const youtube = cleanOptional(body.youtube, 500)
  const xiaohongshu = cleanOptional(body.xiaohongshu, 500)
  const notes = cleanOptional(body.notes, 4000)

  if (!nickname) {
    return jsonNoStore({ error: 'Creator or channel name is required' }, { status: 400 })
  }
  if (!contactEmail || !EMAIL_PATTERN.test(contactEmail)) {
    return jsonNoStore({ error: 'A valid partnership contact email is required' }, { status: 400 })
  }
  if (!countryRegion || !primaryMarket) {
    return jsonNoStore({ error: 'Country or region and primary market are required' }, { status: 400 })
  }
  if (audienceSize == null) {
    return jsonNoStore({ error: 'Enter a valid audience size' }, { status: 400 })
  }
  if (!contentFocus) {
    return jsonNoStore({ error: 'Content focus is required' }, { status: 400 })
  }
  if (!isValidWebsite(websiteUrl)) {
    return jsonNoStore({ error: 'Website must use an http or https URL' }, { status: 400 })
  }

  const hasPublicPresence = [websiteUrl, instagram, tiktok, youtube, xiaohongshu].some(Boolean)
  if (!hasPublicPresence) {
    return jsonNoStore(
      { error: 'Provide at least one public channel or website' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('kol_collaboration_leads')
    .insert({
      customer_id: auth.applicant.customerId,
      account_email_snapshot: auth.applicant.accountEmail,
      nickname,
      gender: null,
      email: contactEmail,
      contact_email: contactEmail,
      phone,
      whatsapp_or_wechat: whatsappOrWechat,
      country_region: countryRegion,
      primary_market: primaryMarket,
      audience_size: audienceSize,
      content_focus: contentFocus,
      website_url: websiteUrl,
      instagram,
      tiktok,
      youtube,
      xiaohongshu,
      notes,
      review_status: 'new',
      unread_admin_count: 1,
      submitted_at: now,
      updated_at: now,
    })
    .select('lead_id, review_status, submitted_at')
    .single()

  const errorIdentity = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`
  if (
    error?.code === '23505' &&
    errorIdentity.includes('kol_collaboration_leads_one_open_per_customer_key')
  ) {
    return jsonNoStore(
      { error: 'You already have an active partnership application', code: 'open_application_exists' },
      { status: 409 }
    )
  }
  if (error || !data?.lead_id) {
    return jsonNoStore({ error: 'Unable to submit your partnership application' }, { status: 500 })
  }

  return jsonNoStore({ ok: true, application: data })
}
