'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, FileCheck2, Loader2, Package, Printer } from 'lucide-react'
import { AdminButton, AdminNotice, AdminStatusBadge } from '@/components/admin/AdminUi'
import { AdminFloatingDialog } from '@/components/admin/AdminFloatingDialog'
import type { AdminOrderProductionSnapshot } from '@/lib/admin-order-production'

function formatDate(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function OrderProductionSnapshot({
  orderId,
  mode,
  onClose,
}: {
  orderId: string
  mode: 'pdf' | 'print'
  onClose: () => void
}) {
  const [snapshot, setSnapshot] = useState<AdminOrderProductionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestIntentRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const requestIntent = ++requestIntentRef.current

    void fetch(`/api/admin/orders/${orderId}/production`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to load production snapshot')
        return data as AdminOrderProductionSnapshot
      })
      .then((data) => {
        if (requestIntentRef.current === requestIntent) setSnapshot(data)
      })
      .catch((loadError) => {
        if (controller.signal.aborted || requestIntentRef.current !== requestIntent) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load production snapshot')
      })
      .finally(() => {
        if (requestIntentRef.current === requestIntent) setLoading(false)
      })

    return () => {
      controller.abort()
      requestIntentRef.current += 1
    }
  }, [orderId])

  const visibleJobs = snapshot?.jobs.filter((job) => mode === 'pdf' || job.requiresPrint) ?? []
  const isPdf = mode === 'pdf'

  return (
    <AdminFloatingDialog
      onClose={onClose}
      eyebrow={isPdf ? 'Customer PDF' : 'Print handoff'}
      title={snapshot?.order.displayId || orderId}
      maxWidthClassName="max-w-2xl"
      placement="center"
    >
          {loading && !snapshot ? (
            <div className="grid min-h-56 place-items-center text-[var(--admin-page-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <AdminNotice tone="danger">{error}</AdminNotice>
          ) : visibleJobs.length ? (
            <div className="space-y-3">
              {visibleJobs.map((job) => (
                <article key={job.key} className="admin-v2-job-bubble p-4">
                  <div className="flex gap-3">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)]">
                      {job.thumbnailUrl ? (
                        // Dynamic signed Storage images intentionally bypass the Vercel image optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={job.thumbnailUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <div className="grid h-full place-items-center text-[var(--admin-page-muted)]">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-base font-bold text-[var(--admin-page-ink)]">
                        {job.displayTitle}
                      </h3>
                      <p className="mt-1 text-xs capitalize text-[var(--admin-page-muted)]">
                        {job.packageType || job.productType || 'Book'} · Qty {job.quantity}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isPdf ? (
                          <AdminStatusBadge tone={job.releasedAt ? 'success' : 'info'}>
                            PDF {job.reviewStatus}
                          </AdminStatusBadge>
                        ) : (
                          <AdminStatusBadge tone={job.printReleasedAt ? 'success' : 'neutral'}>
                            Print {job.printStatus}
                          </AdminStatusBadge>
                        )}
                        {isPdf && job.pageIssueCount > 0 ? (
                          <AdminStatusBadge tone="warning">{job.pageIssueCount} page issues</AdminStatusBadge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-[var(--admin-page-muted)]">
                    {isPdf ? (
                      <div className="rounded-xl bg-[var(--admin-panel-2)] p-3">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--admin-page-ink)]">
                        <FileCheck2 className="h-3.5 w-3.5" /> PDF
                      </span>
                      <span className="mt-1 block">{job.approvedPages}/{job.totalPages} approved</span>
                      <span className="block">Released {formatDate(job.releasedAt)}</span>
                      <span className="block">Email {formatDate(job.emailSentAt)}</span>
                    </div>
                    ) : (
                      <div className="rounded-xl bg-[var(--admin-panel-2)] p-3">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--admin-page-ink)]">
                        <Printer className="h-3.5 w-3.5" /> Print
                      </span>
                      <span className="mt-1 block capitalize">{job.printStatus}</span>
                      <span className="block">Released {formatDate(job.printReleasedAt)}</span>
                    </div>
                    )}
                  </div>

                  {job.errorMessage ? (
                    <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                      {job.errorMessage}
                    </p>
                  ) : null}

                  {job.finalJobId ? (
                    <a
                      href={`/admin/finals?job=${encodeURIComponent(job.finalJobId)}&version=${mode}`}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--admin-accent)] px-4 text-sm font-bold text-[var(--admin-accent-ink)] transition hover:brightness-95"
                    >
                      {isPdf ? 'Open PDF Review' : 'Open Print Review'}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <AdminButton type="button" disabled className="mt-4 w-full">
                      Final job pending
                    </AdminButton>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="py-14 text-center text-sm text-[var(--admin-page-muted)]">
              {isPdf ? 'This order has no PDF production items.' : 'This order has no Print production items.'}
            </p>
          )}
    </AdminFloatingDialog>
  )
}
