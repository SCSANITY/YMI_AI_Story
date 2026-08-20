import { FinalReviewPanel } from '@/components/admin/FinalReviewPanel'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'
import { isUuid } from '@/lib/validators'
import type { ReviewVersion } from '@/components/admin/final-review/types'

export default async function FinalsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const requestedJobId = typeof params.job === 'string' ? params.job : null
  const initialFinalJobId = isUuid(requestedJobId) ? requestedJobId : null
  const requestedVersion = typeof params.version === 'string' ? params.version : null
  const initialVersion: ReviewVersion = requestedVersion === 'print' ? 'print' : 'pdf'

  return (
    <AdminPage className="xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <AdminPageHeader eyebrow="Review" title="Final Review" />
      <div className="h-4 shrink-0" />
      <FinalReviewPanel initialFinalJobId={initialFinalJobId} initialVersion={initialVersion} />
    </AdminPage>
  )
}
