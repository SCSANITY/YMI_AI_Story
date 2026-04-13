import type { Language } from '@/types'
import { DEFAULT_EXCHANGE_RATES, UI_LOCALES } from '@/lib/i18n-config'

export type CheckoutCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'AUD'
  | 'CAD'
  | 'SGD'
  | 'HKD'
  | 'KRW'
  | 'CNY'

export const SUPPORTED_CHECKOUT_CURRENCIES: CheckoutCurrency[] = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'HKD',
  'KRW',
  'CNY',
]

const MINOR_UNIT_DECIMALS: Record<CheckoutCurrency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  AUD: 2,
  CAD: 2,
  SGD: 2,
  HKD: 2,
  KRW: 0,
  CNY: 2,
}

const CURRENCY_INTL_LOCALES: Record<CheckoutCurrency, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  AUD: 'en-AU',
  CAD: 'en-CA',
  SGD: 'en-SG',
  HKD: 'zh-HK',
  KRW: 'ko-KR',
  CNY: 'zh-CN',
}

export const normalizeCheckoutCurrency = (value: unknown): CheckoutCurrency => {
  const raw = String(value ?? '').trim().toUpperCase()
  if (SUPPORTED_CHECKOUT_CURRENCIES.includes(raw as CheckoutCurrency)) {
    return raw as CheckoutCurrency
  }
  return 'USD'
}

export const getDefaultCheckoutCurrency = (language: Language): CheckoutCurrency => {
  return normalizeCheckoutCurrency(UI_LOCALES[language]?.currency ?? 'USD')
}

export const convertUsdToCurrency = (usdAmount: number, currency: CheckoutCurrency) => {
  const rate = DEFAULT_EXCHANGE_RATES[currency] ?? 1
  return usdAmount * rate
}

export const convertUsdToLocale = (usdAmount: number, language: Language) => {
  const locale = UI_LOCALES[language]
  return convertUsdToCurrency(usdAmount, normalizeCheckoutCurrency(locale.currency))
}

export const formatCurrencyAmount = (
  usdAmount: number,
  currency: CheckoutCurrency,
  intlLocale?: string
) => {
  const currencyValue = convertUsdToCurrency(usdAmount, currency)
  return formatMajorCurrencyValue(currencyValue, currency, intlLocale)
}

export const formatMajorCurrencyValue = (
  majorAmount: number,
  currency: CheckoutCurrency,
  intlLocale?: string
) => {
  const locale =
    intlLocale ||
    Object.values(UI_LOCALES).find((entry) => entry.currency === currency)?.intlLocale ||
    CURRENCY_INTL_LOCALES[currency]

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: MINOR_UNIT_DECIMALS[currency],
      minimumFractionDigits: MINOR_UNIT_DECIMALS[currency],
    }).format(majorAmount)
  } catch {
    return `${currency} ${majorAmount.toFixed(MINOR_UNIT_DECIMALS[currency])}`
  }
}

export const toMinorUnit = (majorAmount: number, currency: CheckoutCurrency) => {
  const decimals = MINOR_UNIT_DECIMALS[currency]
  if (decimals === 0) return Math.round(majorAmount)
  return Math.round(majorAmount * 10 ** decimals)
}

export const fromMinorUnit = (minorAmount: number, currency: CheckoutCurrency) => {
  const decimals = MINOR_UNIT_DECIMALS[currency]
  if (decimals === 0) return minorAmount
  return minorAmount / 10 ** decimals
}

export const formatLocaleCurrency = (usdAmount: number, language: Language) => {
  const locale = UI_LOCALES[language]
  return formatCurrencyAmount(
    usdAmount,
    normalizeCheckoutCurrency(locale.currency),
    locale.intlLocale
  )
}
