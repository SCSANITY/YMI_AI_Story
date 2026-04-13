import { NextRequest, NextResponse } from 'next/server'
import { UI_LOCALES } from '@/lib/i18n-config'
import {
  type CheckoutCurrency,
  getDefaultCheckoutCurrency,
  normalizeCheckoutCurrency,
} from '@/lib/locale-pricing'
import type { Language } from '@/types'

const EUR_COUNTRIES = new Set([
  'AD',
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MC',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
  'SM',
  'VA',
])

const COUNTRY_CURRENCY_MAP: Record<string, CheckoutCurrency> = {
  US: 'USD',
  CN: 'CNY',
  HK: 'HKD',
  MO: 'HKD',
  TW: 'HKD',
  KR: 'KRW',
  JP: 'JPY',
  GB: 'GBP',
  AU: 'AUD',
  NZ: 'AUD',
  CA: 'CAD',
  SG: 'SGD',
}

function resolveLanguage(raw: string | null): Language {
  if (raw && raw in UI_LOCALES) {
    return raw as Language
  }
  return 'en'
}

function resolveCurrencyFromCountry(countryCode: string | null): CheckoutCurrency | null {
  const code = String(countryCode ?? '')
    .trim()
    .toUpperCase()

  if (!code) return null
  if (EUR_COUNTRIES.has(code)) return 'EUR'
  return COUNTRY_CURRENCY_MAP[code] ?? null
}

export async function GET(request: NextRequest) {
  const language = resolveLanguage(request.nextUrl.searchParams.get('language'))
  const fallbackCurrency = getDefaultCheckoutCurrency(language)
  const countryCode =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code')

  const currency = normalizeCheckoutCurrency(
    resolveCurrencyFromCountry(countryCode) ?? fallbackCurrency
  )

  return NextResponse.json({
    currency,
    country: countryCode ?? null,
    source: countryCode ? 'ip' : 'language',
  })
}
