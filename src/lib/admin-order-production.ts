export type AdminOrderProductionSnapshotJob = {
  key: string
  finalJobId: string | null
  displayTitle: string
  productType: string | null
  packageType: string | null
  requiresPrint: boolean
  quantity: number
  thumbnailUrl: string | null
  totalPages: number
  approvedPages: number
  pageIssueCount: number
  reviewStatus: string
  releasedAt: string | null
  emailSentAt: string | null
  printStatus: string
  printReleasedAt: string | null
  errorMessage: string | null
}

export type AdminOrderProductionSnapshot = {
  order: {
    orderId: string
    displayId: string | null
    orderStatus: string | null
    email: string | null
    createdAt: string
  }
  jobs: AdminOrderProductionSnapshotJob[]
}

export type AdminLinkedOrder = {
  orderId: string
  displayId: string | null
  orderStatus: string | null
  email: string | null
  createdAt: string
}

export function preferredFinalPagePath(page: {
  approved_output_path?: string | null
  manual_output_path?: string | null
  ai_output_path?: string | null
}) {
  return page.approved_output_path || page.manual_output_path || page.ai_output_path || null
}

export function countFinalPageIssues(pages: Array<{
  status?: string | null
  error_message?: string | null
}>) {
  return pages.filter((page) => {
    const status = String(page.status ?? '').toLowerCase()
    return Boolean(page.error_message) || status === 'failed' || status === 'needs_fix'
  }).length
}
