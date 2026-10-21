import 'server-only'
import { randomInt,randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'
import { sendOtpEmail } from '@/lib/email'
import { normalizeGuestOtpEmail,createGuestOtpRateLimitKey,resolveGuestOtpClientIp,parseGuestOtpRateLimitDecision } from '@/lib/guest-otp'
import { MaterialError,materialUuid } from '@/lib/order-materials'

// Reuse the existing guest OTP delivery/rate/verification system without turning
// its generic verified=true response into a login or material-write credential.
export async function requestMaterialRecovery(request: Request,orderId: string,emailInput: unknown) {
  materialUuid(orderId)
  const email=normalizeGuestOtpEmail(emailInput)
  if (!email) throw new MaterialError('invalid_verification',400)
  const secret=process.env.OTP_RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!secret) throw new MaterialError('materials_unavailable',503)
  const session=await getOrCreateAnonSession()
  const ip=resolveGuestOtpClientIp(request.headers)
  const {data:rate,error:rateError}=await supabaseAdmin.rpc('consume_guest_otp_rate_limit',{
    p_email_key:createGuestOtpRateLimitKey('email',email,secret),
    p_session_key:createGuestOtpRateLimitKey('session',session,secret),
    p_ip_key:ip ? createGuestOtpRateLimitKey('ip',ip,secret) : null,
  })
  const limit=parseGuestOtpRateLimitDecision(rate)
  if (rateError || !limit) throw new MaterialError('materials_unavailable',503)
  if (!limit.allowed) throw new MaterialError('verification_rate_limited',429)
  const reply={challengeId:randomUUID(),expiresAt:new Date(Date.now()+10*60000).toISOString()}
  const {data:order,error:orderError}=await supabaseAdmin.from('orders')
    .select('email,order_status,paid_at,payment_id').eq('order_id',orderId).maybeSingle()
  if (orderError) throw new MaterialError('materials_unavailable',503)
  if (!order?.paid_at || !order.payment_id || !['paid','production'].includes(String(order.order_status))
    || normalizeGuestOtpEmail(order.email)!==email) return reply
  const code=String(randomInt(100000,1000000))
  const {data:verification,error:insertError}=await supabaseAdmin.from('verification_codes')
    .insert({email,code,expires_at:reply.expiresAt}).select('verification_id').single()
  if (insertError || !verification?.verification_id) throw new MaterialError('materials_unavailable',503)
  const verificationId=String(verification.verification_id)
  try {
    const {data:challenge,error:challengeError}=await supabaseAdmin.rpc('materials_begin_recovery',{
      p_order:orderId,p_verification:verificationId,
    })
    if (challengeError || typeof challenge!=='string') throw new MaterialError('materials_unavailable',503)
    await sendOtpEmail(email,code,verificationId)
    await supabaseAdmin.from('verification_codes').delete().eq('email',email).neq('verification_id',verificationId)
    return {...reply,challengeId:materialUuid(challenge)}
  } catch {
    await supabaseAdmin.from('verification_codes').delete().eq('verification_id',verificationId)
    throw new MaterialError('materials_unavailable',503)
  }
}
