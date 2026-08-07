import {
  parseFinalPageMetadataContract,
  type FinalPageRole,
} from '@/lib/final-page-metadata'

export type AdminFinalPageSource = {
  final_job_page_id: string
  page_index: number
  status: string
  ai_output_path: string | null
  manual_output_path: string | null
  approved_output_path: string | null
  approved_source: 'ai' | 'manual' | null
  provider_request_id: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_intent_id: string | null
  review_intent_type: 'approve' | 'needs_fix' | 'approve_all' | null
  review_intent_at: string | null
  attempt_count: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export type AdminFinalPageReadModel = {
  page_contract: {
    schema_version: 2 | null
    asset_layout: 'single-page' | null
  }
  pages: Array<{
    final_job_page_id: string
    page_index: number
    output_order: number | null
    role: FinalPageRole | null
    spread_index: number | null
    side: 'left' | 'right' | null
    page_number: number | null
    status: string
    approved_source: 'ai' | 'manual' | null
    provider_request_id: string | null
    review_note: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    review_intent_id: string | null
    review_intent_type: 'approve' | 'needs_fix' | 'approve_all' | null
    review_intent_at: string | null
    attempt_count: number
    error_message: string | null
    created_at: string
    updated_at: string
    has_ai_output: boolean
    has_manual_output: boolean
    has_approved_output: boolean
  }>
}

export function buildAdminFinalPageReadModel(args: {
  outputAssets: unknown
  totalPages: number
  reviewPages: AdminFinalPageSource[]
}): AdminFinalPageReadModel {
  const contract = parseFinalPageMetadataContract({
    outputAssets: args.outputAssets,
    totalPages: args.totalPages,
    pageIndices: args.reviewPages.map((page) => page.page_index),
  })
  const metadataByIndex = new Map(contract.pages.map((page) => [page.page_index, page]))

  const pages = args.reviewPages.map((page) => {
    const metadata = metadataByIndex.get(page.page_index)
    if (contract.schemaVersion === 2 && !metadata) {
      throw new Error(`Missing V2 Final metadata for review page ${page.page_index}`)
    }
    return {
      final_job_page_id: page.final_job_page_id,
      page_index: page.page_index,
      output_order: metadata?.output_order ?? null,
      role: metadata?.role ?? null,
      spread_index: metadata?.spread_index ?? null,
      side: metadata?.side ?? null,
      page_number: metadata?.page_number ?? null,
      status: page.status,
      approved_source: page.approved_source,
      provider_request_id: page.provider_request_id,
      review_note: page.review_note,
      reviewed_by: page.reviewed_by,
      reviewed_at: page.reviewed_at,
      review_intent_id: page.review_intent_id,
      review_intent_type: page.review_intent_type,
      review_intent_at: page.review_intent_at,
      attempt_count: page.attempt_count,
      error_message: page.error_message,
      created_at: page.created_at,
      updated_at: page.updated_at,
      has_ai_output: Boolean(page.ai_output_path),
      has_manual_output: Boolean(page.manual_output_path),
      has_approved_output: Boolean(page.approved_output_path),
    }
  })

  pages.sort((a, b) => {
    if (contract.schemaVersion === 2) {
      return Number(a.output_order) - Number(b.output_order)
    }
    return a.page_index - b.page_index
  })

  return {
    page_contract: {
      schema_version: contract.schemaVersion,
      asset_layout: contract.assetLayout,
    },
    pages,
  }
}
