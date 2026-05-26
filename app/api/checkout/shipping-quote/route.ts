import { NextResponse } from 'next/server'
import { DEFAULT_EXCHANGE_RATES } from '@/lib/i18n-config'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ShippingMethodRow = {
  method_code: string
  display_name: string
  description: string | null
  speed_label: string | null
  sort_order: number | null
}

type ZoneCountryRow = {
  zone_code: string
  country_code: string
  region_key: string | null
  region_label: string | null
  country_label: string | null
  priority: number | null
}

type BaseRateRow = {
  zone_code: string
  method_code: string
  weight_kg: number | string
  base_cost_hkd: number | string
  source_cost_text: string | null
  source_channel: string | null
  source_note: string | null
}

type PricingRuleRow = {
  rule_id: string
  rule_name: string
  method_code: string | null
  zone_code: string | null
  fuel_surcharge_percent: number | string | null
  handling_fee_hkd: number | string | null
  margin_percent: number | string | null
  discount_percent: number | string | null
  fx_adjustment_percent: number | string | null
  min_charge_hkd: number | string | null
  priority: number | null
}

type SupportedMethodRow = {
  method_code: string
}

type ShippingQuoteOption = {
  methodCode: string
  methodName: string
  methodDescription: string | null
  speedLabel: string | null
  amountUsd: number
  displayAmount: string
  rateName: string
  estimatedDelivery: string
  message: string
  snapshot: Record<string, unknown> | null
}

const HKD_TO_USD_RATE = DEFAULT_EXCHANGE_RATES.HKD || 7.8

const SOUTH_CHINA_KEYWORDS = [
  'GUANGDONG',
  'GUANGZHOU',
  'SHENZHEN',
  'DONGGUAN',
  'ZHUHAI',
  'FOSHAN',
  'ZHONGSHAN',
  'HUIZHOU',
  'JIANGMEN',
  'ZHAOQING',
  'PEARL RIVER',
  'PRD',
  '广东',
  '廣東',
  '广州',
  '廣州',
  '深圳',
  '东莞',
  '東莞',
  '珠海',
  '佛山',
  '中山',
  '惠州',
  '江门',
  '江門',
  '肇庆',
  '肇慶',
  '珠三角',
  '华南',
  '華南',
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeRegionKey(value: unknown) {
  const raw = normalizeText(value)
  if (!raw) return null
  const lowered = raw.toLowerCase()
  if (lowered === 'cn-south') return 'CN-South'
  if (lowered === 'cn-other') return 'CN-Other'
  return raw
}

function resolveRegionKey(countryCode: string, address: Record<string, unknown>) {
  if (countryCode !== 'CN') return null
  const haystack = [
    address.region,
    address.regionCode,
    address.city,
    address.addressLine1,
    address.address,
  ]
    .map((value) => normalizeText(value).toUpperCase())
    .join(' ')

  return SOUTH_CHINA_KEYWORDS.some((keyword) => haystack.includes(keyword.toUpperCase()))
    ? 'CN-South'
    : 'CN-Other'
}

function applyPricingRule(baseCostHkd: number, rule: PricingRuleRow | null) {
  if (!rule) return baseCostHkd
  const fuel = numeric(rule.fuel_surcharge_percent) / 100
  const margin = numeric(rule.margin_percent) / 100
  const discount = numeric(rule.discount_percent) / 100
  const fxAdjustment = numeric(rule.fx_adjustment_percent) / 100
  const handling = numeric(rule.handling_fee_hkd)
  const minCharge = numeric(rule.min_charge_hkd)

  let amount = baseCostHkd * (1 + fuel)
  amount += handling
  amount *= 1 + margin
  amount *= Math.max(0, 1 - discount)
  amount *= 1 + fxAdjustment
  return Math.max(minCharge, amount)
}

function choosePricingRule(rules: PricingRuleRow[], methodCode: string, zoneCode: string) {
  return (
    rules
      .filter((rule) => {
        if (rule.method_code && rule.method_code !== methodCode) return false
        if (rule.zone_code && rule.zone_code !== zoneCode) return false
        return true
      })
      .sort((left, right) => {
        const leftScore = Number(left.priority ?? 0) + (left.zone_code ? 100 : 0) + (left.method_code ? 10 : 0)
        const rightScore = Number(right.priority ?? 0) + (right.zone_code ? 100 : 0) + (right.method_code ? 10 : 0)
        return rightScore - leftScore
      })[0] ?? null
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const address = body?.shippingAddress ?? body?.address ?? body ?? {}
    const countryCode = normalizeCode(address.country || address.countryCode)
    const city = normalizeText(address.city)
    const postalCode = normalizeText(address.zip || address.postalCode)
    const selectedDestinationLabel = normalizeText(address.shippingDestinationLabel)
    const regionKey =
      normalizeRegionKey(address.shippingRegionKey || address.regionKey) ??
      resolveRegionKey(countryCode, address)

    if (!countryCode || !city || !postalCode) {
      return NextResponse.json({
        available: false,
        reason: 'missing_address',
        options: [],
        selectedMethod: null,
        shippingAmountUsd: 0,
        displayShippingAmount: null,
        rateName: null,
        estimatedDelivery: null,
        message: 'Enter address to calculate shipping.',
      })
    }

    const { data: zoneRows, error: zoneError } = await supabaseAdmin
      .from('shipping_zone_countries')
      .select('zone_code, country_code, region_key, region_label, country_label, priority')
      .eq('enabled', true)
      .eq('country_code', countryCode)

    if (zoneError) {
      return NextResponse.json({ error: 'Failed to calculate shipping.' }, { status: 500 })
    }

    const zone = ((zoneRows ?? []) as ZoneCountryRow[])
      .filter((row) => {
        if (!row.region_key) return countryCode !== 'CN'
        return row.region_key === regionKey
      })
      .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))[0]

    if (!zone) {
      return NextResponse.json({
        available: false,
        reason: 'no_zone',
        options: [],
        selectedMethod: null,
        shippingAmountUsd: 0,
        displayShippingAmount: null,
        rateName: null,
        estimatedDelivery: null,
        message: 'We cannot confirm shipping for this destination yet.',
      })
    }

    const [methodsResult, supportResult, ratesResult, rulesResult] = await Promise.all([
      supabaseAdmin
        .from('shipping_methods')
        .select('method_code, display_name, description, speed_label, sort_order')
        .eq('enabled', true)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('shipping_country_method_support')
        .select('method_code')
        .eq('enabled', true)
        .eq('country_code', countryCode),
      supabaseAdmin
        .from('shipping_base_rates')
        .select('zone_code, method_code, weight_kg, base_cost_hkd, source_cost_text, source_channel, source_note')
        .eq('enabled', true)
        .eq('zone_code', zone.zone_code)
        .eq('weight_kg', 1),
      supabaseAdmin
        .from('shipping_pricing_rules')
        .select(
          'rule_id, rule_name, method_code, zone_code, fuel_surcharge_percent, handling_fee_hkd, margin_percent, discount_percent, fx_adjustment_percent, min_charge_hkd, priority'
        )
        .eq('enabled', true),
    ])

    if (methodsResult.error || supportResult.error || ratesResult.error || rulesResult.error) {
      return NextResponse.json({ error: 'Failed to calculate shipping.' }, { status: 500 })
    }

    const supportedMethods = new Set(
      ((supportResult.data ?? []) as SupportedMethodRow[]).map((row) => row.method_code)
    )
    const ratesByMethod = new Map(((ratesResult.data ?? []) as BaseRateRow[]).map((rate) => [rate.method_code, rate]))
    const rules = (rulesResult.data ?? []) as PricingRuleRow[]

    const options = ((methodsResult.data ?? []) as ShippingMethodRow[])
      .filter((method) => supportedMethods.has(method.method_code))
      .map((method) => {
        const rate = ratesByMethod.get(method.method_code)
        if (!rate) return null
        const baseCostHkd = numeric(rate.base_cost_hkd)
        const rule = choosePricingRule(rules, method.method_code, zone.zone_code)
        const finalCostHkd = applyPricingRule(baseCostHkd, rule)
        const amountUsd = Math.max(0, finalCostHkd / HKD_TO_USD_RATE)
        const estimatedDelivery =
          method.method_code === 'speedy' ? 'Fast express delivery' : 'Standard postal delivery'
        const rateName = `${method.display_name} - ${zone.zone_code.replace('_', ' ')}`
        return {
          methodCode: method.method_code,
          methodName: method.display_name,
          methodDescription: method.description,
          speedLabel: method.speed_label,
          amountUsd,
          displayAmount: `$${amountUsd.toFixed(2)}`,
          rateName,
          estimatedDelivery,
          message: estimatedDelivery,
          snapshot: {
            methodCode: method.method_code,
            methodName: method.display_name,
            zoneCode: zone.zone_code,
            zoneRegionKey: zone.region_key,
            zoneRegionLabel: zone.region_label,
            countryCode,
            countryLabel: zone.country_label,
            shippingDestinationLabel: selectedDestinationLabel || zone.country_label,
            city,
            postalCode,
            baseCostHkd,
            finalCostHkd,
            sourceCurrency: 'HKD',
            systemCurrency: 'USD',
            shippingAmountUsd: amountUsd,
            sourceCostText: rate.source_cost_text,
            sourceChannel: rate.source_channel,
            sourceNote: rate.source_note,
            pricingRule: rule
              ? {
                  ruleId: rule.rule_id,
                  ruleName: rule.rule_name,
                  fuelSurchargePercent: numeric(rule.fuel_surcharge_percent),
                  handlingFeeHkd: numeric(rule.handling_fee_hkd),
                  marginPercent: numeric(rule.margin_percent),
                  discountPercent: numeric(rule.discount_percent),
                  fxAdjustmentPercent: numeric(rule.fx_adjustment_percent),
                  minChargeHkd: numeric(rule.min_charge_hkd),
                }
              : null,
          },
        }
      })
      .filter((option) => option !== null) as ShippingQuoteOption[]

    const selectedOption = options.find((option) => option.methodCode === 'standard') ?? options[0] ?? null

    if (!selectedOption) {
      return NextResponse.json({
        available: false,
        reason: 'no_supported_rate',
        options: [],
        selectedMethod: null,
        shippingAmountUsd: 0,
        displayShippingAmount: null,
        rateName: null,
        estimatedDelivery: null,
        message: 'Shipping is not available for this destination yet.',
      })
    }

    return NextResponse.json({
      available: true,
      reason: null,
      options,
      selectedMethod: selectedOption.methodCode,
      shippingAmountUsd: selectedOption.amountUsd,
      displayShippingAmount: selectedOption.displayAmount,
      rateName: selectedOption.rateName,
      estimatedDelivery: selectedOption.estimatedDelivery,
      message: selectedOption.message,
      rateSnapshot: selectedOption.snapshot,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to calculate shipping.'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
