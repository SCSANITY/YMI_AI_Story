import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CollaborationLeadCreatePayload, CollaborationLeadGender } from '@/types'

const VALID_GENDERS = new Set<CollaborationLeadGender>([
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say',
])

const cleanOptional = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<CollaborationLeadCreatePayload>

  const nickname = cleanOptional(body.nickname)
  const gender = cleanOptional(body.gender) as CollaborationLeadGender | null
  const email = cleanOptional(body.email)
  const phone = cleanOptional(body.phone)
  const whatsappOrWechat = cleanOptional(body.whatsapp_or_wechat)
  const instagram = cleanOptional(body.instagram)
  const tiktok = cleanOptional(body.tiktok)
  const youtube = cleanOptional(body.youtube)
  const xiaohongshu = cleanOptional(body.xiaohongshu)
  const notes = cleanOptional(body.notes)

  if (!nickname) {
    return NextResponse.json({ error: 'Nickname is required' }, { status: 400 })
  }

  if (!gender || !VALID_GENDERS.has(gender)) {
    return NextResponse.json({ error: 'Gender is required' }, { status: 400 })
  }

  const hasContact = [email, phone, whatsappOrWechat, instagram, tiktok, youtube, xiaohongshu].some(Boolean)
  if (!hasContact) {
    return NextResponse.json({ error: 'At least one contact method or social account is required' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let customerId: string | null = null
  if (user?.id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    customerId = customer?.customer_id ?? null
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('kol_collaboration_leads')
    .insert({
      customer_id: customerId,
      nickname,
      gender,
      email,
      phone,
      whatsapp_or_wechat: whatsappOrWechat,
      instagram,
      tiktok,
      youtube,
      xiaohongshu,
      notes,
      updated_at: now,
    })
    .select('lead_id')
    .single()

  if (error || !data?.lead_id) {
    return NextResponse.json({ error: 'Failed to save collaboration lead' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    leadId: data.lead_id,
  })
}
