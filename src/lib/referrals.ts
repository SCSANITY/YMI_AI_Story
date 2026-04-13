import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { resolveCoverAssetFromOrder } from '@/lib/share-preview'

const DISCOUNT_AMOUNT_USD = 5
const REWARD_AMOUNT_USD = 5
const REFERRAL_EXPIRY_DAYS = 30
const PAID_STATUSES = ['paid', 'processing', 'shipped']

export type DiscountApplication = {
  applied: boolean
  code: string | null
  kind: 'referral' | 'coupon' | null
  amountUsd: number
  couponCodeId?: string | null
  message?: string
}

export type RewardVoucherStatus = 'active' | 'redeemed' | 'expired' | 'cancelled'

export type RewardVoucher = {
  couponCodeId: string
  code: string
  amountUsd: number
  status: RewardVoucherStatus
  expiresAt: string
  redeemedAt?: string | null
  sourceOrderId?: string | null
}

type OrderDiscountRow = {
  order_id: string
  order_status: string
  payment_id?: string | null
  customer_id?: string | null
  email?: string | null
  applied_discount_code?: string | null
  applied_discount_type?: 'referral' | 'coupon' | null
  applied_referral_code_id?: string | null
  applied_coupon_code_id?: string | null
  discount_amount_usd?: number | null
}

type ReferralCodeRow = {
  referral_code_id: string
  order_id: string
  inviter_customer_id: string
  inviter_email: string
  code: string
  discount_amount_usd: number
  reward_amount_usd: number
  status: string
  expires_at: string
}

type CouponCodeRow = {
  coupon_code_id: string
  customer_id: string
  code: string
  amount_usd: number
  status: string
  expires_at: string
  redeemed_at?: string | null
  source_order_id?: string | null
}

function normalizeCode(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

function createReadableCode(prefix: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let body = ''
  for (let index = 0; index < bytes.length; index += 1) {
    body += alphabet[bytes[index] % alphabet.length]
  }
  return `${prefix}-${body}`
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

function toRewardVoucher(row: CouponCodeRow): RewardVoucher {
  const normalizedStatus: RewardVoucherStatus =
    row.status === 'active' && isExpired(row.expires_at)
      ? 'expired'
      : (row.status as RewardVoucherStatus)

  return {
    couponCodeId: row.coupon_code_id,
    code: row.code,
    amountUsd: Number(row.amount_usd ?? 0),
    status: normalizedStatus,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at ?? null,
    sourceOrderId: row.source_order_id ?? null,
  }
}

async function generateUniqueCode(
  table: 'referral_codes' | 'customer_coupon_codes',
  prefix: string
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextCode = createReadableCode(prefix)
    const { data: existing } = await supabaseAdmin
      .from(table)
      .select(table === 'referral_codes' ? 'referral_code_id' : 'coupon_code_id')
      .eq('code', nextCode)
      .maybeSingle()

    if (!existing) {
      return nextCode
    }
  }

  throw new Error(`Failed to generate unique ${prefix} code`)
}

async function loadOrder(orderId: string): Promise<OrderDiscountRow> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(
      'order_id, order_status, payment_id, customer_id, email, applied_discount_code, applied_discount_type, applied_referral_code_id, applied_coupon_code_id, discount_amount_usd'
    )
    .eq('order_id', orderId)
    .maybeSingle()

  if (error || !order?.order_id) {
    throw new Error(`Order not found: ${error?.message || 'unknown error'}`)
  }

  return order as OrderDiscountRow
}

async function hasPriorPaidOrder(orderId: string, customerId?: string | null, email?: string | null) {
  if (!customerId && !email) return false

  let paidByCustomer = 0
  if (customerId) {
    const { count } = await supabaseAdmin
      .from('orders')
      .select('order_id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .neq('order_id', orderId)
      .in('order_status', PAID_STATUSES)
    paidByCustomer = count ?? 0
  }

  let paidByEmail = 0
  if (email) {
    const normalizedEmail = email.trim().toLowerCase()
    const { count } = await supabaseAdmin
      .from('orders')
      .select('order_id', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .neq('order_id', orderId)
      .in('order_status', PAID_STATUSES)
    paidByEmail = count ?? 0
  }

  return paidByCustomer > 0 || paidByEmail > 0
}

async function loadReferralCode(code: string): Promise<ReferralCodeRow | null> {
  const { data } = await supabaseAdmin
    .from('referral_codes')
    .select(
      'referral_code_id, order_id, inviter_customer_id, inviter_email, code, discount_amount_usd, reward_amount_usd, status, expires_at'
    )
    .eq('code', code)
    .maybeSingle()

  return (data as ReferralCodeRow | null) ?? null
}

async function loadCouponCodeById(couponCodeId: string): Promise<CouponCodeRow | null> {
  const { data } = await supabaseAdmin
    .from('customer_coupon_codes')
    .select('coupon_code_id, customer_id, code, amount_usd, status, expires_at, redeemed_at, source_order_id')
    .eq('coupon_code_id', couponCodeId)
    .maybeSingle()

  return (data as CouponCodeRow | null) ?? null
}

async function validateReferralCodeForOrder(params: {
  code: string
  order: OrderDiscountRow
  customerId?: string | null
  email?: string | null
}) {
  const referral = await loadReferralCode(params.code)
  if (!referral) return null

  if (referral.status !== 'active') {
    throw new Error('This invite code is no longer active.')
  }

  if (isExpired(referral.expires_at)) {
    throw new Error('This invite code has expired.')
  }

  const checkoutEmail = String(params.email || params.order.email || '').trim().toLowerCase()
  if (
    (params.customerId && referral.inviter_customer_id === params.customerId) ||
    (checkoutEmail && referral.inviter_email.trim().toLowerCase() === checkoutEmail)
  ) {
    throw new Error('You cannot use your own invite code.')
  }

  const priorPaid = await hasPriorPaidOrder(params.order.order_id, params.customerId, checkoutEmail)
  if (priorPaid) {
    throw new Error('Invite codes are only available for the first paid order.')
  }

  return {
    kind: 'referral' as const,
    amountUsd: Number(referral.discount_amount_usd ?? DISCOUNT_AMOUNT_USD),
    referral,
  }
}

export async function releaseOrderDiscountCode(orderId: string) {
  const order = await loadOrder(orderId)

  if (order.applied_referral_code_id) {
    await supabaseAdmin
      .from('referral_redemptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('referred_order_id', orderId)
      .eq('referral_code_id', order.applied_referral_code_id)
      .eq('status', 'applied')
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      applied_discount_code: null,
      applied_discount_type: null,
      applied_referral_code_id: null,
      applied_coupon_code_id: null,
      discount_amount_usd: 0,
    })
    .eq('order_id', orderId)

  if (error) {
    throw new Error(`Failed to clear discount code: ${error.message}`)
  }
}

export async function validateDiscountCode(params: {
  orderId: string
  code: string
  customerId?: string | null
  email?: string | null
}) {
  const order = await loadOrder(params.orderId)
  if (order.order_status !== 'unpaid' || order.payment_id) {
    throw new Error('Discount codes can only be applied before payment.')
  }

  const normalizedCode = normalizeCode(params.code)
  if (!normalizedCode) {
    throw new Error('Please enter a valid code.')
  }

  const referral = await validateReferralCodeForOrder({
    code: normalizedCode,
    order,
    customerId: params.customerId,
    email: params.email,
  })
  if (referral) return { ...referral, code: normalizedCode }

  throw new Error('This invite code is invalid.')
}

export async function applyReferralCodeToOrder(params: {
  orderId: string
  code?: string | null
  customerId?: string | null
  email?: string | null
}) {
  const normalizedCode = normalizeCode(params.code)
  if (!normalizedCode) {
    await releaseOrderDiscountCode(params.orderId)
    return {
      applied: false,
      code: null,
      kind: null,
      amountUsd: 0,
      couponCodeId: null,
      message: 'Discount code removed.',
    } satisfies DiscountApplication
  }

  const order = await loadOrder(params.orderId)
  if (order.order_status !== 'unpaid' || order.payment_id) {
    throw new Error('Discount codes can only be applied before payment.')
  }

  const resolved = await validateDiscountCode({
    orderId: params.orderId,
    code: normalizedCode,
    customerId: params.customerId,
    email: params.email,
  })

  const sameReferral =
    order.applied_referral_code_id === resolved.referral.referral_code_id &&
    order.applied_discount_type === 'referral'

  if (!sameReferral && order.applied_discount_code) {
    await releaseOrderDiscountCode(params.orderId)
  }

  const checkoutEmail = String(params.email || order.email || '').trim().toLowerCase() || null
  const { error: redemptionError } = await supabaseAdmin
    .from('referral_redemptions')
    .upsert(
      {
        referral_code_id: resolved.referral.referral_code_id,
        referred_order_id: params.orderId,
        referred_customer_id: params.customerId ?? order.customer_id ?? null,
        referred_email: checkoutEmail,
        status: 'applied',
        discount_amount_usd: resolved.amountUsd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'referred_order_id' }
    )

  if (redemptionError) {
    throw new Error(`Failed to reserve invite code: ${redemptionError.message}`)
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update({
      customer_id: params.customerId ?? order.customer_id ?? null,
      email: checkoutEmail ?? order.email ?? null,
      applied_discount_code: resolved.code,
      applied_discount_type: 'referral',
      applied_referral_code_id: resolved.referral.referral_code_id,
      applied_coupon_code_id: null,
      discount_amount_usd: resolved.amountUsd,
    })
    .eq('order_id', params.orderId)

  if (orderUpdateError) {
    throw new Error(`Failed to apply invite code: ${orderUpdateError.message}`)
  }

  return {
    applied: true,
    code: resolved.code,
    kind: resolved.kind,
    amountUsd: resolved.amountUsd,
    couponCodeId: null,
  } satisfies DiscountApplication
}

export async function listRewardVouchersForCustomer(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from('customer_coupon_codes')
    .select('coupon_code_id, customer_id, code, amount_usd, status, expires_at, redeemed_at, source_order_id')
    .eq('customer_id', customerId)
    .eq('source_type', 'referral_reward')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load reward vouchers: ${error.message}`)
  }

  return ((data ?? []) as CouponCodeRow[]).map(toRewardVoucher)
}

export async function applyRewardVoucherToOrder(params: {
  orderId: string
  couponCodeId?: string | null
  customerId?: string | null
  email?: string | null
}) {
  const couponCodeId = String(params.couponCodeId || '').trim()
  if (!couponCodeId) {
    await releaseOrderDiscountCode(params.orderId)
    return {
      applied: false,
      code: null,
      kind: null,
      amountUsd: 0,
      couponCodeId: null,
      message: 'Reward voucher removed.',
    } satisfies DiscountApplication
  }

  const order = await loadOrder(params.orderId)
  if (order.order_status !== 'unpaid' || order.payment_id) {
    throw new Error('Reward vouchers can only be applied before payment.')
  }

  const coupon = await loadCouponCodeById(couponCodeId)
  if (!coupon) {
    throw new Error('Reward voucher not found.')
  }

  if (coupon.status !== 'active') {
    throw new Error('This reward voucher is no longer active.')
  }

  if (isExpired(coupon.expires_at)) {
    throw new Error('This reward voucher has expired.')
  }

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email')
    .eq('customer_id', coupon.customer_id)
    .maybeSingle()

  if (!customer?.customer_id) {
    throw new Error('Reward voucher owner is missing.')
  }

  const checkoutEmail = String(params.email || order.email || '').trim().toLowerCase()
  const ownsVoucher =
    (params.customerId && params.customerId === customer.customer_id) ||
    (checkoutEmail && checkoutEmail === String(customer.email || '').trim().toLowerCase())

  if (!ownsVoucher) {
    throw new Error('This reward voucher belongs to a different account.')
  }

  const sameCoupon =
    order.applied_coupon_code_id === coupon.coupon_code_id && order.applied_discount_type === 'coupon'

  if (!sameCoupon && order.applied_discount_code) {
    await releaseOrderDiscountCode(params.orderId)
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update({
      customer_id: params.customerId ?? order.customer_id ?? coupon.customer_id,
      email: checkoutEmail || order.email || customer.email || null,
      applied_discount_code: coupon.code,
      applied_discount_type: 'coupon',
      applied_referral_code_id: null,
      applied_coupon_code_id: coupon.coupon_code_id,
      discount_amount_usd: Number(coupon.amount_usd ?? DISCOUNT_AMOUNT_USD),
    })
    .eq('order_id', params.orderId)

  if (orderUpdateError) {
    throw new Error(`Failed to apply reward voucher: ${orderUpdateError.message}`)
  }

  return {
    applied: true,
    code: coupon.code,
    kind: 'coupon',
    amountUsd: Number(coupon.amount_usd ?? DISCOUNT_AMOUNT_USD),
    couponCodeId: coupon.coupon_code_id,
  } satisfies DiscountApplication
}

export async function ensureOrderReferralCode(params: {
  orderId: string
  customerId?: string | null
  email?: string | null
}) {
  const order = await loadOrder(params.orderId)
  if (!PAID_STATUSES.includes(order.order_status) && order.order_status !== 'paid') {
    throw new Error('Invite codes are only available after payment.')
  }

  const requestEmail = String(params.email || order.email || '').trim().toLowerCase()
  const ownsOrder =
    (params.customerId && order.customer_id === params.customerId) ||
    (requestEmail && String(order.email || '').trim().toLowerCase() === requestEmail)

  if (!ownsOrder) {
    throw new Error('This order does not belong to the current account.')
  }

  const { data: existingCode } = await supabaseAdmin
    .from('referral_codes')
    .select(
      'referral_code_id, order_id, inviter_customer_id, inviter_email, code, discount_amount_usd, reward_amount_usd, status, expires_at'
    )
    .eq('order_id', params.orderId)
    .maybeSingle()

  let referralCode = existingCode as ReferralCodeRow | null

  if (!referralCode) {
    const cover = await resolveCoverAssetFromOrder(params.orderId)
    const code = await generateUniqueCode('referral_codes', 'YMI')
    const expiresAt = new Date(Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: inserted, error } = await supabaseAdmin
      .from('referral_codes')
      .insert({
        order_id: params.orderId,
        inviter_customer_id: order.customer_id,
        inviter_email: requestEmail || order.email || '',
        code,
        template_id: cover.templateId,
        cover_bucket: cover.bucket,
        cover_storage_path: cover.storagePath,
        discount_amount_usd: DISCOUNT_AMOUNT_USD,
        reward_amount_usd: REWARD_AMOUNT_USD,
        status: 'active',
        expires_at: expiresAt,
      })
      .select(
        'referral_code_id, order_id, inviter_customer_id, inviter_email, code, discount_amount_usd, reward_amount_usd, status, expires_at'
      )
      .single()

    if (error || !inserted) {
      throw new Error(`Failed to create invite code: ${error?.message || 'unknown error'}`)
    }

    referralCode = inserted as ReferralCodeRow
  }

  return {
    code: referralCode.code,
    inviteUrl: buildAbsoluteUrl(`/invite/${referralCode.code}`),
    expiresAt: referralCode.expires_at,
    discountAmountUsd: Number(referralCode.discount_amount_usd ?? DISCOUNT_AMOUNT_USD),
    rewardAmountUsd: Number(referralCode.reward_amount_usd ?? REWARD_AMOUNT_USD),
  }
}

export async function finalizeReferralRewardForPaidOrder(orderId: string) {
  const order = await loadOrder(orderId)

  if (!PAID_STATUSES.includes(order.order_status) && order.order_status !== 'paid') {
    return { applied: false, rewarded: false, couponRedeemed: false }
  }

  let couponRedeemed = false

  if (order.applied_coupon_code_id) {
    const coupon = await loadCouponCodeById(order.applied_coupon_code_id)

    if (coupon?.coupon_code_id && coupon.status === 'active' && !isExpired(coupon.expires_at)) {
      const { error: redeemError } = await supabaseAdmin
        .from('customer_coupon_codes')
        .update({
          status: 'redeemed',
          redeemed_order_id: orderId,
          redeemed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('coupon_code_id', coupon.coupon_code_id)
        .eq('status', 'active')

      if (redeemError) {
        throw new Error(`Failed to redeem reward voucher: ${redeemError.message}`)
      }
      couponRedeemed = true
    }
  }

  if (!order.applied_referral_code_id) {
    return { applied: couponRedeemed, rewarded: false, couponRedeemed }
  }

  const { data: redemption } = await supabaseAdmin
    .from('referral_redemptions')
    .select('referral_redemption_id, status, reward_coupon_code_id')
    .eq('referred_order_id', orderId)
    .eq('referral_code_id', order.applied_referral_code_id)
    .maybeSingle()

  if (!redemption?.referral_redemption_id) {
    throw new Error('Referral redemption missing for this order')
  }

  if (redemption.status === 'paid' && redemption.reward_coupon_code_id) {
    return { applied: true, rewarded: true, couponRedeemed }
  }

  const { data: referralCode } = await supabaseAdmin
    .from('referral_codes')
    .select(
      'referral_code_id, order_id, inviter_customer_id, inviter_email, code, reward_amount_usd, status'
    )
    .eq('referral_code_id', order.applied_referral_code_id)
    .maybeSingle()

  if (!referralCode?.referral_code_id) {
    throw new Error('Referral code not found')
  }

  let rewardCouponCodeId = redemption.reward_coupon_code_id ?? null

  if (!rewardCouponCodeId) {
    const rewardCode = await generateUniqueCode('customer_coupon_codes', 'GIFT')
    const expiresAt = new Date(Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: rewardCoupon, error: rewardCouponError } = await supabaseAdmin
      .from('customer_coupon_codes')
      .insert({
        customer_id: referralCode.inviter_customer_id,
        source_type: 'referral_reward',
        source_order_id: orderId,
        source_referral_code_id: referralCode.referral_code_id,
        code: rewardCode,
        amount_usd: Number(referralCode.reward_amount_usd ?? REWARD_AMOUNT_USD),
        status: 'active',
        expires_at: expiresAt,
      })
      .select('coupon_code_id')
      .single()

    if (rewardCouponError || !rewardCoupon?.coupon_code_id) {
      throw new Error(
        `Failed to create inviter reward voucher: ${rewardCouponError?.message || 'unknown error'}`
      )
    }

    rewardCouponCodeId = rewardCoupon.coupon_code_id
  }

  const nowIso = new Date().toISOString()

  const { error: redemptionError } = await supabaseAdmin
    .from('referral_redemptions')
    .update({
      status: 'paid',
      reward_coupon_code_id: rewardCouponCodeId,
      rewarded_at: nowIso,
      updated_at: nowIso,
    })
    .eq('referral_redemption_id', redemption.referral_redemption_id)

  if (redemptionError) {
    throw new Error(`Failed to finalize referral redemption: ${redemptionError.message}`)
  }

  return { applied: true, rewarded: true, couponRedeemed }
}
