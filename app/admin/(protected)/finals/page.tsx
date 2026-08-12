import { FinalReviewPanel } from '@/components/admin/FinalReviewPanel'
import { AdminPage } from '@/components/admin/AdminUi'

export default function FinalsPage() {
  return (
    <AdminPage className="xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <h1 className="sr-only">Final Review</h1>
      <FinalReviewPanel />
    </AdminPage>
  )
}
