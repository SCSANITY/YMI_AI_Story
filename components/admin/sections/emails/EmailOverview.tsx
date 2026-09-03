import {
  Activity,
  CircleAlert,
  Clock3,
  ExternalLink,
  MailCheck,
  MousePointerClick,
  PencilLine,
  ShieldCheck,
} from 'lucide-react'
import { AdminNotice, AdminPanel } from '@/components/admin/AdminUi'
import type { ResendOperationsSummary } from '@/components/admin/sections/emails/types'

type CatalogSummary = {
  total: number
  automatic: number
  workflow: number
  human: number
  previewable: number
  providerManaged: number
}

export function EmailOverview({
  catalog,
  operations,
  operationsError,
}: {
  catalog: CatalogSummary
  operations: ResendOperationsSummary
  operationsError: string | null
}) {
  const dailyCombined = operations.dailySent + operations.dailyReceived
  const issues =
    operations.inboundFailed
    + operations.inboundStranded
    + operations.webhookFailed
    + operations.webhookPendingMatch
    + operations.webhookStaleProcessing
    + operations.providerDeliveryFailures

  return (
    <div className="space-y-5">
      <section aria-labelledby="email-inventory-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--admin-accent-dp)]">System inventory</p>
            <h2 id="email-inventory-heading" className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">
              Outbound email map
            </h2>
          </div>
          <p className="text-xs text-[var(--admin-page-muted)]">Read-only · code and provider ownership</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric icon={MailCheck} label="Active families" value={catalog.total} detail="All outbound channels" />
          <OverviewMetric icon={Clock3} label="Automatic" value={catalog.automatic} detail="Customer or scheduled triggers" />
          <OverviewMetric icon={MousePointerClick} label="Workflow-bound" value={catalog.workflow} detail="Sent after an admin action" />
          <OverviewMetric icon={PencilLine} label="Human-authored" value={catalog.human} detail="Support, partnerships, mail" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <AdminPanel className="overflow-hidden">
          <div className="border-b border-black/[0.06] px-5 py-4">
            <p className="text-xs font-semibold text-[var(--admin-accent-dp)]">Customer journey</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">When messages leave YMI Story</h2>
          </div>
          <ol className="grid gap-px bg-black/[0.05] sm:grid-cols-2">
            <JourneyStep index="01" title="Verify" detail="Guest checkout and account security messages" />
            <JourneyStep index="02" title="Confirm" detail="Newsletter opt-in and successful purchase" />
            <JourneyStep index="03" title="Deliver" detail="Released PDF and production progress" />
            <JourneyStep index="04" title="Continue" detail="Shipping, support, and partnership conversations" />
          </ol>
        </AdminPanel>

        <AdminPanel className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[var(--admin-accent-dp)]">Template coverage</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">Ownership is explicit</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-[var(--admin-accent-dp)]" aria-hidden="true" />
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <CoverageRow label="YMI previews" value={`${catalog.previewable} families`} />
            <CoverageRow label="Provider managed" value={`${catalog.providerManaged} families`} />
            <CoverageRow label="Editable in Admin" value="None" />
          </dl>
          <p className="mt-5 rounded-lg bg-black/[0.035] p-3 text-xs leading-5 text-[var(--admin-page-muted)]">
            Supabase and Stripe layouts remain outside the Web repository and are labelled instead of imitated.
          </p>
        </AdminPanel>
      </div>

      <section aria-labelledby="email-health-heading">
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--admin-accent-dp)]">Delivery health</p>
          <h2 id="email-health-heading" className="mt-1 text-lg font-bold text-[var(--admin-page-ink)]">
            Resend operations snapshot
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric icon={Activity} label="Today combined" value={dailyCombined} detail={`${operations.dailySent} sent / ${operations.dailyReceived} received`} />
          <OverviewMetric icon={MailCheck} label="Month combined" value={operations.monthlySent + operations.monthlyReceived} detail={`${operations.monthlySent} sent / ${operations.monthlyReceived} received`} />
          <OverviewMetric icon={CircleAlert} label="Items needing attention" value={issues} detail="Processing and delivery" warning={issues > 0} />
          <OverviewMetric icon={ExternalLink} label="Optional tracking" value={operations.optionalTrackingEvents} detail="Open/click events in 30 days" warning={operations.optionalTrackingEvents > 0} />
        </div>

        {operationsError ? (
          <AdminNotice tone="danger" className="mt-3">
            Operations metrics failed to load: {operationsError}
          </AdminNotice>
        ) : issues > 0 ? (
          <AdminNotice tone="warning" className="mt-3">
            Delivery or processing items need attention. Open Delivery Events for the affected records.
          </AdminNotice>
        ) : (
          <AdminNotice tone="success" className="mt-3">
            No current processing or provider-delivery issue was found.
          </AdminNotice>
        )}
      </section>
    </div>
  )
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof Activity
  label: string
  value: number
  detail: string
  warning?: boolean
}) {
  return (
    <AdminPanel className={`p-4 ${warning ? 'border-[#ead28d] bg-[#fff7db]' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--admin-page-muted)]">{label}</p>
        <Icon className={`h-4 w-4 ${warning ? 'text-[#856516]' : 'text-[var(--admin-accent-dp)]'}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black text-[var(--admin-page-ink)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--admin-page-muted)]">{detail}</p>
    </AdminPanel>
  )
}

function JourneyStep({ index, title, detail }: { index: string; title: string; detail: string }) {
  return (
    <li className="bg-white/70 p-5">
      <span className="font-mono text-xs font-bold text-[var(--admin-accent-dp)]">{index}</span>
      <h3 className="mt-2 font-bold text-[var(--admin-page-ink)]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--admin-page-muted)]">{detail}</p>
    </li>
  )
}

function CoverageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-3 last:border-0 last:pb-0">
      <dt className="text-[var(--admin-page-muted)]">{label}</dt>
      <dd className="font-semibold text-[var(--admin-page-ink)]">{value}</dd>
    </div>
  )
}
