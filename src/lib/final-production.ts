import { parseFinalPageMetadataContract } from '@/lib/final-page-metadata'

export type FinalProductionMode = 'manual' | 'auto'
export const MANUAL_FINAL_PENDING_STATUS = 'manual_pending' as const

export function resolveNewFinalProductionMode(value: unknown): FinalProductionMode {
  if (value === undefined || value === null || value === '' || value === 'manual') return 'manual'
  if (value === 'auto') return 'auto'
  throw new Error('final_production_mode_invalid')
}

export function getFrozenFinalProductionMode(inputSnapshot: unknown): FinalProductionMode {
  const snapshot = inputSnapshot && typeof inputSnapshot === 'object'
    ? inputSnapshot as Record<string, unknown> : {}
  // Pre-mode Jobs belong to the existing automatic path. New jobs always freeze
  // the decision; reading it never consults the current environment switch.
  if (snapshot.final_production_mode === undefined) return 'auto'
  if (snapshot.final_production_mode === 'manual' || snapshot.final_production_mode === 'auto') {
    return snapshot.final_production_mode
  }
  throw new Error('final_production_mode_invalid')
}

export function initialFinalProductionStatus(mode: FinalProductionMode): 'queued' | 'manual_pending' {
  return mode === 'manual' ? MANUAL_FINAL_PENDING_STATUS : 'queued'
}

export function buildManualFinalOutputAssets(config: Record<string, unknown>): Record<string, unknown> {
  const final = config.final as { page_indices?: unknown } | undefined
  if (config.schema_version !== 3 || config.asset_layout !== 'single-page'
    || !Array.isArray(config.pages) || !Array.isArray(final?.page_indices)) {
    throw new Error('manual_final_contract_invalid')
  }
  const pageByIndex = new Map(config.pages.map((entry) => {
    const page = entry as Record<string, unknown>
    return [page.index, page] as const
  }))
  const pages = final.page_indices.map((index, outputOrder) => {
    const page = pageByIndex.get(index)
    const presentation = page?.presentation as Record<string, unknown> | undefined
    return { page_index: index, output_order: outputOrder,
      role: presentation?.role, spread_index: presentation?.spread_index,
      side: presentation?.side ?? null, page_number: presentation?.page_number ?? null,
      template_image: page?.template_image, enable_face_swap: page?.enable_face_swap,
      storage_path: null }
  })
  const outputAssets = { schema_version: 3, asset_layout: 'single-page', pages }
  // Existing V3 authority validates cover/order/spread/31-source coverage.
  parseFinalPageMetadataContract({ outputAssets, totalPages: pages.length, pageIndices: final.page_indices as number[] })
  return outputAssets
}
