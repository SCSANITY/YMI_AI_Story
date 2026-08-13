import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isKolPartnershipStatus,
  type KolPartnershipLead,
} from '@/lib/kol-partnerships'

export const KOL_LEAD_FIELDS = [
  'lead_id',
  'lead_code',
  'customer_id',
  'nickname',
  'account_email_snapshot',
  'contact_email',
  'country_region',
  'primary_market',
  'audience_size',
  'content_focus',
  'website_url',
  'instagram',
  'tiktok',
  'youtube',
  'xiaohongshu',
  'phone',
  'whatsapp_or_wechat',
  'notes',
  'review_status',
  'assigned_admin_customer_id',
  'internal_notes',
  'last_message_at',
  'last_message_preview',
  'last_message_direction',
  'unread_admin_count',
  'submitted_at',
  'reviewing_at',
  'contacting_at',
  'partnered_at',
  'declined_at',
  'archived_at',
  'created_at',
  'updated_at',
].join(', ')

export const KOL_LEAD_SUMMARY_FIELDS = [
  'lead_id',
  'lead_code',
  'customer_id',
  'nickname',
  'account_email_snapshot',
  'contact_email',
  'country_region',
  'primary_market',
  'audience_size',
  'review_status',
  'assigned_admin_customer_id',
  'last_message_at',
  'last_message_preview',
  'last_message_direction',
  'unread_admin_count',
  'submitted_at',
  'created_at',
  'updated_at',
].join(', ')

type AdminIdentity = {
  display_name: string | null
  email: string | null
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`KOL lead ${field} is invalid`)
  }
  return value
}

export async function hydrateKolLeads(
  rows: Array<Record<string, unknown>>,
  pendingSenderCountByLead: ReadonlyMap<string, number> = new Map()
) {
  const assignedIds = Array.from(
    new Set(
      rows
        .map((row) => nullableString(row.assigned_admin_customer_id))
        .filter((value): value is string => Boolean(value))
    )
  )
  const adminById = new Map<string, AdminIdentity>()

  if (assignedIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('customer_id, display_name, email')
      .in('customer_id', assignedIds)

    if (error) throw new Error(`Failed to resolve KOL assignees: ${error.message}`)
    for (const customer of data ?? []) {
      adminById.set(customer.customer_id, {
        display_name: customer.display_name ?? null,
        email: customer.email ?? null,
      })
    }
  }

  return rows.map((row): KolPartnershipLead => {
    if (!isKolPartnershipStatus(row.review_status)) {
      throw new Error('KOL lead review status is invalid')
    }
    const assignedId = nullableString(row.assigned_admin_customer_id)
    const assignedAdmin = assignedId ? adminById.get(assignedId) : null
    const lastMessageDirection = row.last_message_direction
    if (
      lastMessageDirection !== null &&
      lastMessageDirection !== undefined &&
      lastMessageDirection !== 'applicant' &&
      lastMessageDirection !== 'admin'
    ) {
      throw new Error('KOL lead message direction is invalid')
    }

    return {
      lead_id: requireString(row.lead_id, 'lead_id'),
      lead_code: requireString(row.lead_code, 'lead_code'),
      customer_id: nullableString(row.customer_id),
      nickname: requireString(row.nickname, 'nickname'),
      account_email_snapshot: nullableString(row.account_email_snapshot),
      contact_email: nullableString(row.contact_email),
      country_region: nullableString(row.country_region),
      primary_market: nullableString(row.primary_market),
      audience_size: typeof row.audience_size === 'number' ? row.audience_size : null,
      content_focus: nullableString(row.content_focus),
      website_url: nullableString(row.website_url),
      instagram: nullableString(row.instagram),
      tiktok: nullableString(row.tiktok),
      youtube: nullableString(row.youtube),
      xiaohongshu: nullableString(row.xiaohongshu),
      phone: nullableString(row.phone),
      whatsapp_or_wechat: nullableString(row.whatsapp_or_wechat),
      notes: nullableString(row.notes),
      review_status: row.review_status,
      assigned_admin_customer_id: assignedId,
      assigned_admin_name: assignedAdmin?.display_name ?? null,
      assigned_admin_email: assignedAdmin?.email ?? null,
      internal_notes: nullableString(row.internal_notes),
      last_message_at: nullableString(row.last_message_at),
      last_message_preview: nullableString(row.last_message_preview),
      last_message_direction: lastMessageDirection ?? null,
      unread_admin_count:
        typeof row.unread_admin_count === 'number' ? row.unread_admin_count : 0,
      pending_sender_count: pendingSenderCountByLead.get(requireString(row.lead_id, 'lead_id')) ?? 0,
      submitted_at: nullableString(row.submitted_at),
      reviewing_at: nullableString(row.reviewing_at),
      contacting_at: nullableString(row.contacting_at),
      partnered_at: nullableString(row.partnered_at),
      declined_at: nullableString(row.declined_at),
      archived_at: nullableString(row.archived_at),
      created_at: requireString(row.created_at, 'created_at'),
      updated_at: requireString(row.updated_at, 'updated_at'),
    }
  })
}

export async function loadAdminKolLead(leadId: string) {
  const [{ data, error }, { count: pendingCount, error: pendingError }] = await Promise.all([
    supabaseAdmin
      .from('kol_collaboration_leads')
      .select(KOL_LEAD_FIELDS)
      .eq('lead_id', leadId)
      .maybeSingle(),
    supabaseAdmin
      .from('kol_collaboration_messages')
      .select('message_id', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .eq('association_state', 'pending'),
  ])

  if (error) throw new Error('Unable to load partnership application')
  if (pendingError) throw new Error('Unable to load partnership sender-review state')
  if (!data) return null
  const [lead] = await hydrateKolLeads(
    [data as unknown as Record<string, unknown>],
    new Map([[leadId, pendingCount ?? 0]])
  )
  return lead
}
