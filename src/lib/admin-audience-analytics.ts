export const AUDIENCE_RANGE_DAYS = [7, 30] as const

export type AudienceRangeDays = (typeof AUDIENCE_RANGE_DAYS)[number]
export type AudienceDimension =
  | 'day'
  | 'country'
  | 'requestPath'
  | 'referrerHostname'
  | 'deviceType'

export type VisitMetricRow = {
  key: string
  pageviews: number
  visitors: number
}

export type AudienceAnalyticsData = {
  days: AudienceRangeDays
  since: string
  until: string
  pageviews: number
  visitors: number
  viewsPerVisitor: number
  trend: VisitMetricRow[]
  countries: VisitMetricRow[]
  pages: VisitMetricRow[]
  referrers: VisitMetricRow[]
  devices: VisitMetricRow[]
}

type DimensionRows = Partial<Record<AudienceDimension, VisitMetricRow[]>>

function finiteCount(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function dateKey(value: unknown) {
  if (typeof value !== 'string') return ''
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? ''
}

function dimensionKey(row: Record<string, unknown>, dimension: AudienceDimension) {
  if (dimension === 'day') return dateKey(row.timestamp)
  const raw = row[dimension]
  return typeof raw === 'string' ? raw.trim() : ''
}

export function normalizeAudienceRange(value: unknown): AudienceRangeDays {
  const first = Array.isArray(value) ? value[0] : value
  return first === '30' || first === 30 ? 30 : 7
}

export function selectTrendLabelIndexes(length: number) {
  const pointCount = Math.max(0, Math.floor(length))
  if (pointCount === 0) return []

  const labelCount = Math.min(pointCount, pointCount <= 7 ? 4 : 5)
  if (labelCount === 1) return [0]

  return Array.from({ length: labelCount }, (_, position) => (
    Math.round((position * (pointCount - 1)) / (labelCount - 1))
  ))
}

export function getAudienceDateRange(days: AudienceRangeDays, now = new Date()) {
  const untilDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ))
  const sinceDate = new Date(untilDate)
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (days - 1))

  return {
    since: sinceDate.toISOString().slice(0, 10),
    until: untilDate.toISOString().slice(0, 10),
  }
}
export function parseVisitAggregateRows(
  payload: unknown,
  dimension: AudienceDimension,
): VisitMetricRow[] {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []

  return data.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const row = candidate as Record<string, unknown>
    const key = dimensionKey(row, dimension)
    if (!key) return []

    return [{
      key,
      pageviews: finiteCount(row.pageviews),
      visitors: finiteCount(row.visitors),
    }]
  })
}

function fillDailyTrend(
  since: string,
  days: AudienceRangeDays,
  rows: VisitMetricRow[],
) {
  const byDate = new Map(rows.map((row) => [row.key, row]))
  const start = new Date(`${since}T00:00:00.000Z`)

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const key = date.toISOString().slice(0, 10)
    return byDate.get(key) ?? { key, pageviews: 0, visitors: 0 }
  })
}

function sumRows(rows: VisitMetricRow[]) {
  return rows.reduce(
    (total, row) => ({
      pageviews: total.pageviews + row.pageviews,
      visitors: total.visitors + row.visitors,
    }),
    { pageviews: 0, visitors: 0 },
  )
}

function sortRows(rows: VisitMetricRow[]) {
  return [...rows].sort(
    (left, right) => right.visitors - left.visitors || right.pageviews - left.pageviews,
  )
}

export function buildAudienceAnalyticsData(
  days: AudienceRangeDays,
  range: { since: string; until: string },
  rows: DimensionRows,
): AudienceAnalyticsData {
  const trend = fillDailyTrend(range.since, days, rows.day ?? [])
  const trendTotals = sumRows(trend)
  const fallbackTotals = [rows.country, rows.requestPath, rows.referrerHostname, rows.deviceType]
    .filter((candidate): candidate is VisitMetricRow[] => Boolean(candidate?.length))
    .map(sumRows)
    .sort((left, right) => right.pageviews - left.pageviews)[0]
  const totals = trendTotals.pageviews > 0 ? trendTotals : (fallbackTotals ?? trendTotals)

  return {
    days,
    ...range,
    pageviews: totals.pageviews,
    visitors: totals.visitors,
    viewsPerVisitor: totals.visitors > 0
      ? Number((totals.pageviews / totals.visitors).toFixed(1))
      : 0,
    trend,
    countries: sortRows(rows.country ?? []),
    pages: sortRows(rows.requestPath ?? []),
    referrers: sortRows(rows.referrerHostname ?? []),
    devices: sortRows(rows.deviceType ?? []),
  }
}
