import Link from 'next/link'
import {
  BarChart3,
  Eye,
  Globe2,
  Laptop,
  MousePointer2,
  Route,
  Users,
} from 'lucide-react'
import {
  AdminEmptyState,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminStatusBadge,
} from '@/components/admin/AdminUi'
import {
  normalizeAudienceRange,
  selectTrendLabelIndexes,
  type AudienceAnalyticsData,
  type AudienceRangeDays,
  type VisitMetricRow,
} from '@/lib/admin-audience-analytics'
import { loadAudienceAnalytics } from '@/lib/admin-audience-analytics-server'

type SearchParams = Record<string, string | string[] | undefined>

const numberFormatter = new Intl.NumberFormat('en-GB')
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function countryName(code: string) {
  if (code === 'Others') return 'Other markets'
  if (!/^[A-Z]{2}$/.test(code)) return code || 'Unknown'
  return regionNames.of(code) ?? code
}

function countryFlag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(...[...code].map((character) => character.charCodeAt(0) + 127397))
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  note: string
  tone: 'peach' | 'gold' | 'sage' | 'plain'
}) {
  const toneClass = tone === 'plain'
    ? 'admin-v2-panel'
    : `admin-v3-metric admin-v3-metric--${tone}`

  return (
    <section className={`${toneClass} min-h-36 p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-current/65">{label}</p>
          <p className="mt-3 text-3xl font-black text-current sm:text-[2.15rem]">{value}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/58 shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-xs leading-5 text-current/65">{note}</p>
    </section>
  )
}

function RangePicker({ active }: { active: AudienceRangeDays }) {
  return (
    <nav
      aria-label="Analytics period"
      className="inline-flex rounded-full border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-1 shadow-sm"
    >
      {[7, 30].map((days) => {
        const isActive = days === active
        return (
          <Link
            key={days}
            href={`/admin/analytics?days=${days}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={`grid min-h-10 place-items-center rounded-full px-4 text-xs font-bold transition ${
              isActive
                ? 'bg-[var(--admin-page-ink)] text-[var(--admin-panel)] shadow-sm'
                : 'text-[var(--admin-page-muted)] hover:text-[var(--admin-page-ink)]'
            }`}
          >
            {days} days
          </Link>
        )
      })}
    </nav>
  )
}

function TrafficTrend({ rows }: { rows: VisitMetricRow[] }) {
  const chartWidth = 720
  const chartHeight = 190
  const top = 18
  const bottom = 32
  const maxValue = Math.max(...rows.map((row) => row.pageviews), 1)
  const usableHeight = chartHeight - top - bottom
  const points = rows.map((row, index) => {
    const x = rows.length > 1 ? (index / (rows.length - 1)) * chartWidth : chartWidth / 2
    const y = top + usableHeight - (row.pageviews / maxValue) * usableHeight
    return { ...row, x, y }
  })
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const area = points.length > 0
    ? `0,${chartHeight - bottom} ${polyline} ${chartWidth},${chartHeight - bottom}`
    : ''
  const labelIndexes = new Set(selectTrendLabelIndexes(points.length))

  return (
    <div>
      <div className="h-52 w-full overflow-hidden" role="img" aria-label="Daily page views trend">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full" preserveAspectRatio="none">
          {[0, 0.5, 1].map((position) => {
            const y = top + usableHeight * position
            return (
              <line
                key={position}
                x1="0"
                x2={chartWidth}
                y1={y}
                y2={y}
                stroke="var(--admin-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          <polygon points={area} fill="rgba(242, 195, 63, 0.17)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--admin-accent-dp)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((point, index) => (
            <g key={point.key}>
              {point.pageviews > 0 ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="var(--admin-card)"
                  stroke="var(--admin-accent-dp)"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {labelIndexes.has(index) ? (
                <text
                  x={point.x}
                  y={chartHeight - 8}
                  textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                  fill="var(--admin-page-muted)"
                  fontSize="12"
                >
                  {point.key.slice(5)}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-5 text-xs text-[var(--admin-page-muted)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--admin-accent-dp)]" />
          Page views
        </span>
        <span>UTC daily totals</span>
      </div>
    </div>
  )
}

function RankedRows({
  rows,
  label,
}: {
  rows: VisitMetricRow[]
  label: (key: string) => React.ReactNode
}) {
  const maxVisitors = Math.max(...rows.map((row) => row.visitors), 1)

  if (rows.length === 0) {
    return <AdminEmptyState>No visits recorded in this period yet.</AdminEmptyState>
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0 font-semibold text-[var(--admin-page-ink)]">{label(row.key)}</div>
            <div className="shrink-0 text-right">
              <span className="font-bold text-[var(--admin-page-ink)]">{formatNumber(row.visitors)}</span>
              <span className="ml-1 text-xs text-[var(--admin-page-muted)]">visitors</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--admin-panel-2)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--admin-accent)] to-[var(--admin-accent-dp)]"
              style={{ width: `${Math.max(4, (row.visitors / maxVisitors) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function AudienceDashboard({ data }: { data: AudienceAnalyticsData }) {
  const topCountry = data.countries.find((country) => country.key !== 'Others')

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Visitors" value={formatNumber(data.visitors)} note="Anonymous daily visitors with Analytics consent" tone="peach" />
        <MetricCard icon={Eye} label="Page views" value={formatNumber(data.pageviews)} note="Public page loads and client-side navigation" tone="gold" />
        <MetricCard icon={MousePointer2} label="Views per visitor" value={data.viewsPerVisitor.toFixed(1)} note="A lightweight signal of browsing depth" tone="sage" />
        <MetricCard icon={Globe2} label="Leading market" value={topCountry ? countryName(topCountry.key) : '—'} note={topCountry ? `${formatNumber(topCountry.visitors)} visitors` : 'Waiting for country data'} tone="plain" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.85fr)]">
        <AdminPanel className="min-w-0 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-[var(--admin-accent-dp)]">Traffic rhythm</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">Daily page views</h2>
            </div>
            <AdminStatusBadge tone="neutral">Production</AdminStatusBadge>
          </div>
          <div className="mt-5"><TrafficTrend rows={data.trend} /></div>
        </AdminPanel>

        <AdminPanel className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-[var(--admin-accent-dp)]" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-[var(--admin-accent-dp)]">Audience</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">Top markets</h2>
            </div>
          </div>
          <div className="mt-6">
            <RankedRows
              rows={data.countries.slice(0, 6)}
              label={(key) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true">{countryFlag(key)}</span>
                  <span className="truncate">{countryName(key)}</span>
                </span>
              )}
            />
          </div>
        </AdminPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <AdminPanel className="p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Route className="h-5 w-5 text-[var(--admin-accent-dp)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--admin-page-ink)]">Popular pages</h2>
          </div>
          <RankedRows rows={data.pages.slice(0, 6)} label={(key) => <span className="block truncate font-mono text-xs">{key}</span>} />
        </AdminPanel>

        <AdminPanel className="p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[var(--admin-accent-dp)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--admin-page-ink)]">Traffic sources</h2>
          </div>
          <RankedRows rows={data.referrers.slice(0, 6)} label={(key) => <span className="block truncate">{key || 'Direct / unknown'}</span>} />
        </AdminPanel>

        <AdminPanel className="p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Laptop className="h-5 w-5 text-[var(--admin-accent-dp)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--admin-page-ink)]">Devices</h2>
          </div>
          <RankedRows rows={data.devices} label={(key) => <span className="capitalize">{key || 'Unknown'}</span>} />
        </AdminPanel>
      </div>
    </>
  )
}

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {}
  const days = normalizeAudienceRange(params.days)
  const result = await loadAudienceAnalytics(days)

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader eyebrow="Market intelligence" title="Audience Analytics" action={<RangePicker active={days} />} />

      {result.status === 'unconfigured' ? (
        <AdminPanel className="p-6 sm:p-8">
          <AdminEmptyState className="flex min-h-56 flex-col items-center justify-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-800">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-[var(--admin-page-ink)]">Analytics setup is incomplete</h2>
            <p className="mt-2 max-w-lg leading-6">Add the server-only Vercel Analytics credentials to load this dashboard.</p>
          </AdminEmptyState>
        </AdminPanel>
      ) : result.status === 'error' ? (
        <AdminNotice tone="warning" role="alert">
          {result.message} Refresh this page in a moment; customer journeys are unaffected.
        </AdminNotice>
      ) : (
        <>
          {result.unavailablePanels.length > 0 ? (
            <AdminNotice tone="warning">Some panels are temporarily unavailable: {result.unavailablePanels.join(', ')}.</AdminNotice>
          ) : null}
          <AudienceDashboard data={result.data} />
          <p className="px-1 text-xs leading-5 text-[var(--admin-page-muted)]">
            Approximate country-level reporting only. No raw IP addresses are stored by YMI Story.
            Data includes production visits after Analytics consent and has no historical backfill.
          </p>
        </>
      )}
    </AdminPage>
  )
}
