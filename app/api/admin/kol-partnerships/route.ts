import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  hydrateKolLeads,
  KOL_LEAD_SUMMARY_FIELDS,
} from '@/lib/admin-kol-partnerships-server'
import {
  isKolPartnershipQueueFilter,
  KOL_OPEN_STATUSES,
  KOL_PARTNERSHIP_STATUSES,
  type KolPartnershipCounts,
} from '@/lib/kol-partnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function countLeads(
  rows: Array<{ lead_id: string; review_status: string; unread_admin_count: number | null }>,
  pendingLeadIds: ReadonlySet<string>
) {
  const counts = Object.fromEntries(
    KOL_PARTNERSHIP_STATUSES.map((status) => [status, 0])
  ) as KolPartnershipCounts
  counts.active = 0
  counts.attention = 0
  counts.all = rows.length

  for (const row of rows) {
    if (row.review_status in counts) {
      counts[row.review_status as keyof KolPartnershipCounts] += 1
    }
    const isOpen = KOL_OPEN_STATUSES.includes(
      row.review_status as (typeof KOL_OPEN_STATUSES)[number]
    )
    if (isOpen) {
      counts.active += 1
    }
    if (
      pendingLeadIds.has(row.lead_id) ||
      (isOpen && (row.review_status === 'new' || Number(row.unread_admin_count || 0) > 0))
    ) {
      counts.attention += 1
    }
  }
  return counts
}

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const searchParams = new URL(request.url).searchParams
  const { data: pendingRows, error: pendingError } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .select('lead_id')
    .eq('association_state', 'pending')
    .limit(1000)
  if (pendingError) return jsonNoStore({ error: 'Unable to load sender review queue' }, 500)
  const pendingSenderCountByLead = new Map<string, number>()
  for (const row of pendingRows ?? []) {
    pendingSenderCountByLead.set(
      row.lead_id,
      (pendingSenderCountByLead.get(row.lead_id) ?? 0) + 1
    )
  }
  const pendingLeadIds = new Set(pendingSenderCountByLead.keys())

  if (searchParams.get('view') === 'attention_count') {
    const { data, error } = await supabaseAdmin
      .from('kol_collaboration_leads')
      .select('lead_id')
      .in('review_status', [...KOL_OPEN_STATUSES])
      .or('review_status.eq.new,unread_admin_count.gt.0')

    if (error) return jsonNoStore({ error: 'Unable to load KOL attention count' }, 500)
    const attentionLeadIds = new Set((data ?? []).map((row) => row.lead_id))
    for (const leadId of pendingLeadIds) attentionLeadIds.add(leadId)
    return jsonNoStore({ ok: true, attentionCount: attentionLeadIds.size })
  }

  const filter = searchParams.get('status') || 'active'
  if (!isKolPartnershipQueueFilter(filter)) {
    return jsonNoStore({ error: 'Invalid partnership status' }, 400)
  }

  const baseListQuery = () => supabaseAdmin
    .from('kol_collaboration_leads')
    .select(KOL_LEAD_SUMMARY_FIELDS)
    .order('unread_admin_count', { ascending: false })
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(250)

  let listRows: Array<Record<string, unknown>> = []
  if (filter === 'attention') {
    const [ordinaryAttention, quarantineAttention] = await Promise.all([
      baseListQuery()
        .in('review_status', [...KOL_OPEN_STATUSES])
        .or('review_status.eq.new,unread_admin_count.gt.0'),
      pendingLeadIds.size > 0
        ? baseListQuery().in('lead_id', [...pendingLeadIds])
        : Promise.resolve({ data: [], error: null }),
    ])
    if (ordinaryAttention.error || quarantineAttention.error) {
      return jsonNoStore({ error: 'Unable to load partnership applications' }, 500)
    }
    const attentionRows = [
      ...(ordinaryAttention.data ?? []),
      ...(quarantineAttention.data ?? []),
    ] as unknown as Array<Record<string, unknown> & { lead_id: string }>
    listRows = Array.from(
      new Map(
        attentionRows.map((row) => [row.lead_id, row as Record<string, unknown>])
      ).values()
    )
  } else {
    let listQuery = baseListQuery()
    if (filter === 'active') {
      listQuery = listQuery.in('review_status', [...KOL_OPEN_STATUSES])
    } else if (filter !== 'all') {
      listQuery = listQuery.eq('review_status', filter)
    }
    const listResult = await listQuery
    if (listResult.error) {
      return jsonNoStore({ error: 'Unable to load partnership applications' }, 500)
    }
    listRows = (listResult.data ?? []) as unknown as Array<Record<string, unknown>>
  }

  const countsResult = await (
    supabaseAdmin
      .from('kol_collaboration_leads')
      .select('lead_id, review_status, unread_admin_count')
      .limit(1000)
  )
  if (countsResult.error) {
    return jsonNoStore({ error: 'Unable to load partnership queue counts' }, 500)
  }

  try {
    const leads = await hydrateKolLeads(
      listRows,
      pendingSenderCountByLead
    )
    return jsonNoStore({
      ok: true,
      leads,
      counts: countLeads(countsResult.data ?? [], pendingLeadIds),
    })
  } catch (error) {
    console.error('Failed to project KOL partnership queue', error)
    return jsonNoStore({ error: 'Partnership queue data is invalid' }, 500)
  }
}
