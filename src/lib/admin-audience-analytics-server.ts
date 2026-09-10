import 'server-only'

import {
  buildAudienceAnalyticsData,
  getAudienceDateRange,
  parseVisitAggregateRows,
  type AudienceAnalyticsData,
  type AudienceDimension,
  type AudienceRangeDays,
  type VisitMetricRow,
} from '@/lib/admin-audience-analytics'

const VERCEL_ANALYTICS_API = 'https://api.vercel.com/v1/query/web-analytics/visits/aggregate'
const REQUEST_TIMEOUT_MS = 8_000

export type AudienceAnalyticsLoadResult =
  | { status: 'ready'; data: AudienceAnalyticsData; unavailablePanels: string[] }
  | { status: 'unconfigured'; missing: string[] }
  | { status: 'error'; message: string }

type AnalyticsConfig = {
  token: string
  projectId: string
  teamId: string | null
}

const DIMENSIONS: Array<{ dimension: AudienceDimension; label: string; limit: number }> = [
  { dimension: 'day', label: 'Traffic trend', limit: 31 },
  { dimension: 'country', label: 'Markets', limit: 12 },
  { dimension: 'requestPath', label: 'Pages', limit: 10 },
  { dimension: 'referrerHostname', label: 'Sources', limit: 10 },
  { dimension: 'deviceType', label: 'Devices', limit: 8 },
]

function readConfig(): AnalyticsConfig | { missing: string[] } {
  const token = process.env.YMI_VERCEL_ANALYTICS_TOKEN?.trim() ?? ''
  const projectId = (
    process.env.YMI_VERCEL_ANALYTICS_PROJECT_ID
    ?? process.env.VERCEL_PROJECT_ID
    ?? ''
  ).trim()
  const teamId = (
    process.env.YMI_VERCEL_ANALYTICS_TEAM_ID
    ?? process.env.VERCEL_TEAM_ID
    ?? ''
  ).trim()
  const missing = [
    !token ? 'YMI_VERCEL_ANALYTICS_TOKEN' : '',
    !projectId ? 'YMI_VERCEL_ANALYTICS_PROJECT_ID' : '',
  ].filter(Boolean)

  return missing.length > 0
    ? { missing }
    : { token, projectId, teamId: teamId || null }
}

async function queryDimension(
  config: AnalyticsConfig,
  dimension: AudienceDimension,
  limit: number,
  range: { since: string; until: string },
): Promise<VisitMetricRow[]> {
  const params = new URLSearchParams({
    projectId: config.projectId,
    by: dimension,
    since: range.since,
    until: range.until,
    limit: String(limit),
    filter: "environment eq 'production'",
  })
  if (config.teamId) params.set('teamId', config.teamId)

  const response = await fetch(`${VERCEL_ANALYTICS_API}?${params}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Vercel Analytics returned ${response.status}`)
  }

  return parseVisitAggregateRows(await response.json(), dimension)
}

export async function loadAudienceAnalytics(
  days: AudienceRangeDays,
): Promise<AudienceAnalyticsLoadResult> {
  const config = readConfig()
  if ('missing' in config) return { status: 'unconfigured', missing: config.missing }

  const range = getAudienceDateRange(days)
  const results = await Promise.allSettled(
    DIMENSIONS.map(({ dimension, limit }) =>
      queryDimension(config, dimension, limit, range)),
  )
  const rows: Partial<Record<AudienceDimension, VisitMetricRow[]>> = {}
  const unavailablePanels: string[] = []

  results.forEach((result, index) => {
    const definition = DIMENSIONS[index]
    if (!definition) return
    if (result.status === 'fulfilled') rows[definition.dimension] = result.value
    else unavailablePanels.push(definition.label)
  })

  if (unavailablePanels.length === DIMENSIONS.length) {
    return {
      status: 'error',
      message: 'Vercel Web Analytics is temporarily unavailable.',
    }
  }

  return {
    status: 'ready',
    data: buildAudienceAnalyticsData(days, range, rows),
    unavailablePanels,
  }
}
