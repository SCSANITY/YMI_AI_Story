import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SHIPPING_DESTINATIONS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'

type ZoneCountryRow = {
  country_code: string
  region_key: string | null
  region_label: string | null
  country_label: string | null
  priority: number | null
}

type CountryRow = {
  country_code: string
  display_name_en: string
  display_name_cn_s: string | null
  display_name_cn_t: string | null
  display_name_ja: string | null
  display_name_es: string | null
  display_name_ko: string | null
  flag_url: string | null
  flag_emoji: string | null
  sort_order: number | null
  enabled: boolean | null
}

type ShippingDestination = {
  id: string
  countryCode: string
  shippingRegionKey: string | null
  regionLabel: string | null
  countryLabel: string
  label: {
    en: string
    cn_s: string
    cn_t: string
    ja: string
    es: string
    ko: string
  }
  flagUrl: string | null
  flagEmoji: string | null
  sortOrder: number
  priority: number
}

function buildLocalizedLabel(country: CountryRow, regionKey: string | null) {
  if (country.country_code === 'CN' && regionKey === 'CN-South') {
    return {
      en: 'China - South China',
      cn_s: '\u4e2d\u56fd - \u534e\u5357\u5730\u533a',
      cn_t: '\u4e2d\u570b - \u83ef\u5357\u5730\u5340',
      ja: '\u4e2d\u56fd - \u83ef\u5357\u5730\u57df',
      es: 'China - Sur de China',
      ko: '\uc911\uad6d - \ud654\ub0a8 \uc9c0\uc5ed',
    }
  }

  if (country.country_code === 'CN' && regionKey === 'CN-Other') {
    return {
      en: 'China - Other Regions',
      cn_s: '\u4e2d\u56fd - \u975e\u534e\u5357\u5730\u533a',
      cn_t: '\u4e2d\u570b - \u975e\u83ef\u5357\u5730\u5340',
      ja: '\u4e2d\u56fd - \u305d\u306e\u4ed6\u306e\u5730\u57df',
      es: 'China - Otras regiones',
      ko: '\uc911\uad6d - \uae30\ud0c0 \uc9c0\uc5ed',
    }
  }

  return {
    en: country.display_name_en,
    cn_s: country.display_name_cn_s || country.display_name_en,
    cn_t: country.display_name_cn_t || country.display_name_cn_s || country.display_name_en,
    ja: country.display_name_ja || country.display_name_en,
    es: country.display_name_es || country.display_name_en,
    ko: country.display_name_ko || country.display_name_en,
  }
}

export async function GET() {
  try {
    const { data: zoneRows, error: zoneError } = await supabaseAdmin
      .from('shipping_zone_countries')
      .select('country_code, region_key, region_label, country_label, priority')
      .eq('enabled', true)

    if (zoneError) {
      return NextResponse.json({ destinations: [] }, { status: 500 })
    }

    const normalizedZoneRows = (zoneRows ?? []) as ZoneCountryRow[]
    const countryCodes = Array.from(new Set(normalizedZoneRows.map((row) => row.country_code)))

    if (countryCodes.length === 0) {
      const response = NextResponse.json({ destinations: [] })
      response.headers.set('Cache-Control', SHIPPING_DESTINATIONS_CACHE_CONTROL)
      return response
    }

    const { data: countryRows, error: countryError } = await supabaseAdmin
      .from('shipping_countries')
      .select(
        'country_code, display_name_en, display_name_cn_s, display_name_cn_t, display_name_ja, display_name_es, display_name_ko, flag_url, flag_emoji, sort_order, enabled'
      )
      .eq('enabled', true)
      .in('country_code', countryCodes)

    if (countryError) {
      return NextResponse.json({ destinations: [] }, { status: 500 })
    }

    const countriesByCode = new Map(
      ((countryRows ?? []) as CountryRow[]).map((country) => [country.country_code, country])
    )

    const destinationsById = new Map<string, ShippingDestination>()

    normalizedZoneRows.forEach((row) => {
      const country = countriesByCode.get(row.country_code)
      if (!country) return
      const id = `${row.country_code}:${row.region_key || 'default'}`
      const labels = buildLocalizedLabel(country, row.region_key)
      const destination: ShippingDestination = {
        id,
        countryCode: row.country_code,
        shippingRegionKey: row.region_key,
        regionLabel: row.region_label,
        countryLabel: row.country_label || country.display_name_en,
        label: labels,
        flagUrl: country.flag_url,
        flagEmoji: country.flag_emoji,
        sortOrder: Number(country.sort_order ?? 9999),
        priority: Number(row.priority ?? 0),
      }

      const existing = destinationsById.get(id)
      if (!existing || destination.priority > existing.priority) {
        destinationsById.set(id, destination)
      }
    })

    const destinations = Array.from(destinationsById.values()).sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.label.en.localeCompare(right.label.en)
    })

    return NextResponse.json(
      { destinations },
      {
        headers: {
          'Cache-Control': SHIPPING_DESTINATIONS_CACHE_CONTROL,
        },
      }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load shipping destinations.'
    return NextResponse.json({ error: message, destinations: [] }, { status: 500 })
  }
}
