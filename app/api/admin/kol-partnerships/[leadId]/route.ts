import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  hydrateKolLeads,
  KOL_LEAD_FIELDS,
  loadAdminKolLead,
} from '@/lib/admin-kol-partnerships-server'
import { loadAdminKolCodes } from '@/lib/admin-kol-codes-server'
import { loadAdminKolCorrespondence } from '@/lib/admin-kol-messages-server'
import {
  isKolPartnershipStatus,
  KOL_OPEN_STATUSES,
} from '@/lib/kol-partnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

const APPLICANT_FIELDS = 'customer_id, email, display_name, created_at'
const STATUS_TIMESTAMP_FIELDS = {
  reviewing: 'reviewing_at',
  contacting: 'contacting_at',
  partnered: 'partnered_at',
  declined: 'declined_at',
  archived: 'archived_at',
} as const

export async function GET(
  _request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId } = await context.params
  if (!isUuid(leadId)) return jsonNoStore({ error: 'Invalid partnership lead id' }, 400)

  try {
    const lead = await loadAdminKolLead(leadId)
    if (!lead) return jsonNoStore({ error: 'Partnership application not found' }, 404)

    const [applicantResult, correspondence, codes] = await Promise.all([
      lead.customer_id
        ? supabaseAdmin
            .from('customers')
            .select(APPLICANT_FIELDS)
            .eq('customer_id', lead.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      loadAdminKolCorrespondence(leadId),
      loadAdminKolCodes(leadId),
    ])

    if (applicantResult.error) {
      return jsonNoStore({ error: 'Unable to load applicant account context' }, 500)
    }

    return jsonNoStore({
      ok: true,
      detail: { lead, applicant: applicantResult.data ?? null, ...correspondence, codes },
    })
  } catch (error) {
    console.error('Failed to load KOL partnership detail', error)
    return jsonNoStore({ error: 'Unable to load partnership application' }, 500)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId } = await context.params
  if (!isUuid(leadId)) return jsonNoStore({ error: 'Invalid partnership lead id' }, 400)

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const expectedUpdatedAt = String(body?.expectedUpdatedAt || '')
  if (!expectedUpdatedAt) {
    return jsonNoStore({ error: 'The partnership version is required' }, 400)
  }

  try {
    const current = await loadAdminKolLead(leadId)
    if (!current) return jsonNoStore({ error: 'Partnership application not found' }, 404)
    if (current.updated_at !== expectedUpdatedAt) {
      return jsonNoStore({ error: 'This application changed in another session', lead: current }, 409)
    }

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { updated_at: now }

    if (action === 'update_status') {
      const status = body?.status
      if (!isKolPartnershipStatus(status)) {
        return jsonNoStore({ error: 'Invalid partnership status' }, 400)
      }
      if (!KOL_OPEN_STATUSES.includes(current.review_status as (typeof KOL_OPEN_STATUSES)[number])) {
        return jsonNoStore({ error: 'Closed partnership applications are read-only' }, 409)
      }
      if (status === current.review_status) return jsonNoStore({ ok: true, lead: current })

      patch.review_status = status
      patch.assigned_admin_customer_id =
        current.assigned_admin_customer_id ?? admin.customer_id
      patch.unread_admin_count = 0
      const timestampField = STATUS_TIMESTAMP_FIELDS[status as keyof typeof STATUS_TIMESTAMP_FIELDS]
      if (timestampField && !current[timestampField]) patch[timestampField] = now
    } else if (action === 'assign_self') {
      patch.assigned_admin_customer_id = admin.customer_id
    } else if (action === 'unassign') {
      patch.assigned_admin_customer_id = null
    } else if (action === 'save_notes') {
      if (typeof body?.internalNotes !== 'string') {
        return jsonNoStore({ error: 'Internal notes must be text' }, 400)
      }
      const internalNotes = body.internalNotes.trim()
      if (internalNotes.length > 12000) {
        return jsonNoStore({ error: 'Internal notes are too long' }, 400)
      }
      patch.internal_notes = internalNotes || null
    } else if (action === 'mark_read') {
      if (current.unread_admin_count === 0) return jsonNoStore({ ok: true, lead: current })
      patch.unread_admin_count = 0
    } else {
      return jsonNoStore({ error: 'Unsupported partnership action' }, 400)
    }

    const { data, error } = await supabaseAdmin
      .from('kol_collaboration_leads')
      .update(patch)
      .eq('lead_id', leadId)
      .eq('updated_at', expectedUpdatedAt)
      .select(KOL_LEAD_FIELDS)
      .maybeSingle()

    if (error) {
      console.error('Failed to update KOL partnership lead', error)
      return jsonNoStore({ error: 'Unable to update partnership application' }, 500)
    }
    if (!data) {
      const latest = await loadAdminKolLead(leadId)
      return jsonNoStore(
        { error: 'This application changed in another session', lead: latest },
        409
      )
    }

    const [lead] = await hydrateKolLeads([data as unknown as Record<string, unknown>])
    return jsonNoStore({ ok: true, lead })
  } catch (error) {
    console.error('Failed to update KOL partnership application', error)
    return jsonNoStore({ error: 'Unable to update partnership application' }, 500)
  }
}
