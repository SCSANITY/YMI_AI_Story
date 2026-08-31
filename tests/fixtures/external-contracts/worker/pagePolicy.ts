import type { InputSnapshot, TemplateConfig, TemplatePage } from './processor'

export type WorkerJobType = 'preview' | 'final'

export function assertMockFinalPageLimitDisabled(args: {
  jobType: WorkerJobType
  isMockMode: boolean
  mockFinalPageLimit: number
}) {
  if (
    args.jobType === 'final' &&
    args.isMockMode &&
    Number.isFinite(args.mockFinalPageLimit) &&
    args.mockFinalPageLimit > 0
  ) {
    throw new Error('MOCK_FINAL_PAGE_LIMIT is not supported for releasable Mock Final jobs')
  }
}

export function normalizeOverridePageIndices(input: Pick<InputSnapshot, 'final_page_indices' | 'final_page_index'>) {
  const raw =
    Array.isArray(input.final_page_indices)
      ? input.final_page_indices
      : input.final_page_index !== undefined
        ? [input.final_page_index]
        : []

  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0)
}

export function hasFinalPageOverride(input: Pick<InputSnapshot, 'final_page_indices' | 'final_page_index'>) {
  return normalizeOverridePageIndices(input).length > 0
}

export function buildFinalPageNumberByIndex(configuredPageIndices: number[]) {
  const pageNumberByIndex = new Map<number, number>()
  configuredPageIndices.forEach((pageIndex, position) => {
    if (pageNumberByIndex.has(pageIndex)) {
      throw new Error(`Final page sequence contains duplicate index ${pageIndex}`)
    }
    pageNumberByIndex.set(pageIndex, position + 1)
  })
  return pageNumberByIndex
}

export function selectPageIndices(args: {
  jobType: WorkerJobType
  config: TemplateConfig
  input: Pick<InputSnapshot, 'final_page_indices' | 'final_page_index'>
  isMockMode: boolean
  mockFinalPageLimit: number
}) {
  const { jobType, config, input, isMockMode, mockFinalPageLimit } = args

  assertMockFinalPageLimitDisabled({ jobType, isMockMode, mockFinalPageLimit })

  const overridePageIndices = jobType === 'final' ? normalizeOverridePageIndices(input) : []
  if (overridePageIndices.length > 0) {
    return overridePageIndices
  }

  const configured = jobType === 'final' ? config.final?.page_indices : config.preview?.page_indices
  return Array.isArray(configured) && configured.length > 0
    ? [...configured]
    : [...config.pages.map((page) => page.index)].sort((a, b) => a - b)
}

export function shouldRenderSubtitleForPage(args: {
  jobType: WorkerJobType
  page: TemplatePage
  subtitleEnabled: boolean
  isMockMode: boolean
  isSinglePageContract?: boolean
}) {
  const { jobType, page, subtitleEnabled, isMockMode, isSinglePageContract = false } = args
  if (isSinglePageContract) {
    return subtitleEnabled
  }
  if (isMockMode && jobType === 'final') {
    return false
  }
  return subtitleEnabled && page.subtitle_render !== false
}

export function shouldBypassFaceProvider(args: {
  page: TemplatePage
  isMockMode: boolean
}) {
  return !args.isMockMode && args.page.enable_face_swap === false
}

export function assertExactPageCoverage(
  expectedPageIndices: number[],
  actualPageIndices: number[],
  actualLabel = 'review_rows'
) {
  const normalize = (values: number[]) => [...values].sort((a, b) => a - b)
  const expected = normalize(expectedPageIndices)
  const actual = normalize(actualPageIndices)

  if (
    expected.length !== actual.length ||
    expected.some((pageIndex, index) => pageIndex !== actual[index])
  ) {
    throw new Error(
      `Final page coverage mismatch (expected=${expected.join(',')}; ${actualLabel}=${actual.join(',')})`
    )
  }
}

export function assertFinalCompletionCoverage(args: {
  expectedPageIndices: number[]
  generatedPageIndices: number[]
  populatedReviewPageIndices: number[]
}) {
  assertExactPageCoverage(args.expectedPageIndices, args.generatedPageIndices, 'outputs')
  assertExactPageCoverage(args.expectedPageIndices, args.populatedReviewPageIndices, 'populated_review_rows')
}
