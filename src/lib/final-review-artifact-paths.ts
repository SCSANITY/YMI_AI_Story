export type FinalArtifactScope = {
  orderId: string
  finalJobId: string
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const APPROVED_PAGE_KEY = new RegExp('^(approved|manual)/page_[0-9]{2,}_' + UUID + '[.]png$')
const LEGACY_MANUAL_PAGE_KEY = new RegExp('^page_[0-9]{2,}_' + UUID + '[.]png$')
const PDF_RELEASE_KEY = new RegExp('^' + UUID + '[.]pdf$')

export class FinalArtifactConflict extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinalArtifactConflict'
  }
}

function finalArtifactRoot(scope: FinalArtifactScope) {
  return 'orders/' + scope.orderId + '/final/books/' + scope.finalJobId
}

function hasScopedSuffix(path: string, prefix: string, suffixPattern: RegExp) {
  return path.startsWith(prefix) && suffixPattern.test(path.slice(prefix.length))
}

export function getFinalPageRevisionPath(
  scope: FinalArtifactScope,
  pageNumber: number,
  kind: 'approved' | 'manual',
  revisionId: string = crypto.randomUUID()
) {
  const revision = revisionId.trim().toLowerCase()
  if (!new RegExp('^' + UUID + '$').test(revision)) {
    throw new FinalArtifactConflict('Invalid Final page revision')
  }
  return finalArtifactRoot(scope) + '/pages/' + kind + '/page_' +
    String(pageNumber).padStart(2, '0') + '_' + revision + '.png'
}

export function isScopedFinalApprovedPage(scope: FinalArtifactScope, path: string) {
  return hasScopedSuffix(path, finalArtifactRoot(scope) + '/pages/', APPROVED_PAGE_KEY)
}

export function isLegacyFinalManualPage(orderId: string, path: string) {
  return hasScopedSuffix(path, 'orders/' + orderId + '/final/pages/manual/', LEGACY_MANUAL_PAGE_KEY)
}

export function getNewFinalPdfReleasePath(scope: FinalArtifactScope) {
  return finalArtifactRoot(scope) + '/pdf/' + crypto.randomUUID() + '.pdf'
}

export function isScopedFinalPdf(scope: FinalArtifactScope, path: string) {
  return hasScopedSuffix(path, finalArtifactRoot(scope) + '/pdf/', PDF_RELEASE_KEY)
}
