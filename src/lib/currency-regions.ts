import type { DisplayCurrency } from '@/types'

export const CURRENCY_GROUP_ORDER: DisplayCurrency[] = [
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

export const CURRENCY_REGION_OPTIONS = [
  { currency: 'USD', region: 'US', label: 'United States' },
  { currency: 'USD', region: 'PR', label: 'Puerto Rico' },
  { currency: 'USD', region: 'GU', label: 'Guam' },
  { currency: 'USD', region: 'VI', label: 'U.S. Virgin Islands' },
  { currency: 'USD', region: 'AS', label: 'American Samoa' },
  { currency: 'USD', region: 'MP', label: 'Northern Mariana Islands' },
  { currency: 'USD', region: 'EC', label: 'Ecuador' },
  { currency: 'USD', region: 'PA', label: 'Panama' },
  { currency: 'USD', region: 'SV', label: 'El Salvador' },
  { currency: 'USD', region: 'TL', label: 'Timor-Leste' },
  { currency: 'USD', region: 'FM', label: 'Micronesia' },
  { currency: 'USD', region: 'MH', label: 'Marshall Islands' },
  { currency: 'USD', region: 'PW', label: 'Palau' },
  { currency: 'USD', region: 'BQ', label: 'Caribbean Netherlands' },
  { currency: 'USD', region: 'VG', label: 'British Virgin Islands' },
  { currency: 'USD', region: 'TC', label: 'Turks and Caicos Islands' },
  { currency: 'EUR', region: 'EU', label: 'Europe' },
  { currency: 'EUR', region: 'AT', label: 'Austria' },
  { currency: 'EUR', region: 'BE', label: 'Belgium' },
  { currency: 'EUR', region: 'BG', label: 'Bulgaria' },
  { currency: 'EUR', region: 'HR', label: 'Croatia' },
  { currency: 'EUR', region: 'CY', label: 'Cyprus' },
  { currency: 'EUR', region: 'EE', label: 'Estonia' },
  { currency: 'EUR', region: 'FI', label: 'Finland' },
  { currency: 'EUR', region: 'FR', label: 'France' },
  { currency: 'EUR', region: 'DE', label: 'Germany' },
  { currency: 'EUR', region: 'GR', label: 'Greece' },
  { currency: 'EUR', region: 'IE', label: 'Ireland' },
  { currency: 'EUR', region: 'IT', label: 'Italy' },
  { currency: 'EUR', region: 'LV', label: 'Latvia' },
  { currency: 'EUR', region: 'LT', label: 'Lithuania' },
  { currency: 'EUR', region: 'LU', label: 'Luxembourg' },
  { currency: 'EUR', region: 'MT', label: 'Malta' },
  { currency: 'EUR', region: 'NL', label: 'Netherlands' },
  { currency: 'EUR', region: 'PT', label: 'Portugal' },
  { currency: 'EUR', region: 'SK', label: 'Slovakia' },
  { currency: 'EUR', region: 'SI', label: 'Slovenia' },
  { currency: 'EUR', region: 'ES', label: 'Spain' },
  { currency: 'EUR', region: 'AD', label: 'Andorra' },
  { currency: 'EUR', region: 'MC', label: 'Monaco' },
  { currency: 'EUR', region: 'SM', label: 'San Marino' },
  { currency: 'EUR', region: 'VA', label: 'Vatican City' },
  { currency: 'EUR', region: 'ME', label: 'Montenegro' },
  { currency: 'EUR', region: 'XK', label: 'Kosovo' },
  { currency: 'GBP', region: 'GB', label: 'United Kingdom' },
  { currency: 'JPY', region: 'JP', label: 'Japan' },
  { currency: 'AUD', region: 'AU', label: 'Australia' },
  { currency: 'AUD', region: 'KI', label: 'Kiribati' },
  { currency: 'AUD', region: 'NR', label: 'Nauru' },
  { currency: 'AUD', region: 'TV', label: 'Tuvalu' },
  { currency: 'CAD', region: 'CA', label: 'Canada' },
  { currency: 'SGD', region: 'SG', label: 'Singapore' },
  { currency: 'HKD', region: 'HK', label: 'Hong Kong' },
  { currency: 'KRW', region: 'KR', label: 'South Korea' },
  { currency: 'CNY', region: 'CN', label: 'China' },
] as const satisfies ReadonlyArray<{
  currency: DisplayCurrency
  region: string
  label: string
}>

export type CurrencyRegionCode = (typeof CURRENCY_REGION_OPTIONS)[number]['region']
export type CurrencyRegionOption = (typeof CURRENCY_REGION_OPTIONS)[number]

export function getCurrencyRegionOption(region: unknown): CurrencyRegionOption | null {
  const normalized = String(region ?? '').trim().toUpperCase()
  return CURRENCY_REGION_OPTIONS.find((option) => option.region === normalized) ?? null
}

export function resolveCurrencyRegionOption(
  region: unknown,
  currency: DisplayCurrency
): CurrencyRegionOption {
  const selected = getCurrencyRegionOption(region)
  if (selected?.currency === currency) return selected

  return CURRENCY_REGION_OPTIONS.find((option) => option.currency === currency) ?? CURRENCY_REGION_OPTIONS[0]
}

export function resolveInitialCurrencyRegionOption({
  savedCurrency,
  savedRegion,
  geoRegion,
  fallbackCurrency,
  preferSaved,
}: {
  savedCurrency: unknown
  savedRegion: unknown
  geoRegion: unknown
  fallbackCurrency: DisplayCurrency
  preferSaved: boolean
}): CurrencyRegionOption {
  const normalizedSavedCurrency = String(savedCurrency ?? '').trim().toUpperCase()
  const validSavedCurrency = CURRENCY_GROUP_ORDER.includes(normalizedSavedCurrency as DisplayCurrency)
    ? normalizedSavedCurrency as DisplayCurrency
    : null
  const validSavedRegion = getCurrencyRegionOption(savedRegion)

  const resolveSavedPreference = () => {
    if (validSavedRegion) {
      if (!validSavedCurrency || validSavedRegion.currency === validSavedCurrency) return validSavedRegion
      return resolveCurrencyRegionOption(null, validSavedCurrency)
    }

    return validSavedCurrency ? resolveCurrencyRegionOption(null, validSavedCurrency) : null
  }

  const savedPreference = resolveSavedPreference()
  if (preferSaved && savedPreference) return savedPreference

  const detectedRegion = getCurrencyRegionOption(geoRegion)
  if (detectedRegion) return detectedRegion

  return savedPreference ?? resolveCurrencyRegionOption(null, fallbackCurrency)
}
