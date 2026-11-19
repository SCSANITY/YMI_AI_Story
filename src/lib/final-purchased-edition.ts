import { normalizeBookPackageType } from './package-pricing'

type PurchasedLine = {
  order_id: string | null
  final_job_id: string | null
  creation_id: string | null
  product_type: string | null
  status: string | null
  package_type: string | null
}

export function finalPurchasedEdition(
  job: { order_id: string; job_id: string; creation_id: string | null },
  purchase: PurchasedLine | PurchasedLine[] | null,
) {
  const line = Array.isArray(purchase) ? (purchase.length === 1 ? purchase[0] : null) : purchase
  return line?.product_type === 'physical' && line.status === 'ordered' &&
    line.order_id === job.order_id && line.final_job_id === job.job_id &&
    line.creation_id && line.creation_id === job.creation_id
    ? normalizeBookPackageType(line.package_type)
    : null
}
