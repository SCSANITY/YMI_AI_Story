import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseSignatureVoiceHardwareAttestationRequest } from '@/lib/signature-voice-admin'
import {
  firstRpcRow,
  loadAdminSignatureVoiceWorkspace,
} from '@/lib/signature-voice-admin-server'
import { verifySignatureVoiceItemNarrationIntegrity } from '@/lib/signature-voice-fulfillment-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function POST(
  request: Request,
  context: {
    params:
      | Promise<{ orderId: string; creationId: string }>
      | { orderId: string; creationId: string }
  }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  const { orderId, creationId } = await Promise.resolve(context.params)

  let input
  try {
    if (!isUuid(orderId) || !isUuid(creationId)) {
      throw new Error('Invalid Signature Voice identity')
    }
    input = parseSignatureVoiceHardwareAttestationRequest(await request.json())
    if (input.creationId !== creationId) {
      throw new Error('Signature Voice Creation changed')
    }
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid hardware attestation' },
      { status: 400 }
    )
  }

  let manifest
  try {
    manifest = await verifySignatureVoiceItemNarrationIntegrity({
      orderId,
      cartItemId: input.cartItemId,
      creationId,
      sourceAssetId: input.sourceAssetId,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Narration integrity verification failed' },
      { status: 409 }
    )
  }

  const { data, error } = await supabaseAdmin.rpc('attest_signature_voice_hardware_loaded', {
    p_order_id: orderId,
    p_cart_item_id: input.cartItemId,
    p_creation_id: creationId,
    p_source_asset_id: input.sourceAssetId,
    p_expected_manifest_sha256: manifest.manifestSha256,
    p_admin_customer_id: admin.customer_id,
  })
  if (error || !firstRpcRow(data)) {
    return jsonNoStore(
      { error: error?.message || 'Hardware loading was not confirmed' },
      { status: /changed|incomplete|triage|manifest/i.test(error?.message || '') ? 409 : 400 }
    )
  }

  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(orderId)
    return jsonNoStore({ workspace })
  } catch (loadError) {
    return jsonNoStore(
      { error: loadError instanceof Error ? loadError.message : 'Attestation saved; refresh required' },
      { status: 500 }
    )
  }
}
