import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseSignatureVoiceTriageRequest } from '@/lib/signature-voice-admin'
import {
  firstRpcRow,
  loadAdminSignatureVoiceWorkspace,
} from '@/lib/signature-voice-admin-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  const { orderId } = await Promise.resolve(context.params)
  if (!isUuid(orderId)) return jsonNoStore({ error: 'Invalid order id' }, { status: 400 })

  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(orderId)
    if (!workspace) return jsonNoStore({ error: 'Order not found' }, { status: 404 })
    return jsonNoStore({ workspace })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to load Signature Voice production' },
      { status: 409 }
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  const { orderId } = await Promise.resolve(context.params)
  if (!isUuid(orderId)) return jsonNoStore({ error: 'Invalid order id' }, { status: 400 })

  let input
  try {
    input = parseSignatureVoiceTriageRequest(await request.json())
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid Signature Voice triage' },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin.rpc('set_signature_voice_source_triage', {
    p_order_id: orderId,
    p_cart_item_id: input.cartItemId,
    p_creation_id: input.creationId,
    p_admin_customer_id: admin.customer_id,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_technical_status: input.technicalStatus,
    p_technical_reason: input.technicalReason,
    p_adult_declaration_status: input.adultDeclarationStatus,
    p_adult_declaration_reason: input.adultDeclarationReason,
  })
  if (error || !firstRpcRow(data)) {
    const conflict = error?.code === '40001' || /changed/i.test(error?.message || '')
    return jsonNoStore(
      { error: error?.message || 'Signature Voice triage was not saved' },
      { status: conflict ? 409 : 400 }
    )
  }

  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(orderId)
    return jsonNoStore({ workspace })
  } catch (loadError) {
    return jsonNoStore(
      { error: loadError instanceof Error ? loadError.message : 'Triage saved; refresh required' },
      { status: 500 }
    )
  }
}
