export const PHOTO_ENGINE = 'a-v1-fa62bb8d'
export const PHOTO_POLICY = 'visible-features-v1-candidate-80'
export const PHOTO_ASSET_BASE = `/photo-preparation/${PHOTO_ENGINE}/`
export const CROP_C = Object.freeze({ sideMargin: 0, topMargin: 0.85, bottomMargin: 0.45 })
export const FEATURE_VISIBILITY_CANDIDATE = 0.8
export const PREPARED_MAX_BYTES = 5 * 1024 * 1024

const FEATURES = ['image-left-eye', 'image-right-eye', 'nose', 'mouth'] as const

type RegionEvidence = {
  key: string
  visibleCoverage: number | null
  samples: number
  originalSupport: number | null
  inputSupport: number | null
  evidence: string
}

export function checkFeatureVisibility(regions: readonly RegionEvidence[]) {
  if (regions.some(region => FEATURES.some(key => key === region.key) &&
    region.evidence === 'original-region-outside-image')) return 'incomplete-face'
  for (const key of FEATURES) {
    const rows = regions.filter(region => region.key === key)
    if (rows.length !== 1) return 'unmeasurable-face'
    const { visibleCoverage, samples, originalSupport, inputSupport, evidence } = rows[0]
    if (evidence !== 'measurement-only' || !Number.isInteger(samples) || samples <= 0 ||
      originalSupport === null || !Number.isFinite(originalSupport) || originalSupport < 1 - 1e-8 ||
      inputSupport === null || !Number.isFinite(inputSupport) || inputSupport < 1 - 1e-8 ||
      visibleCoverage === null || !Number.isFinite(visibleCoverage) || visibleCoverage < 0 || visibleCoverage > 1) {
      return 'unmeasurable-face'
    }
    if (visibleCoverage < FEATURE_VISIBILITY_CANDIDATE) return 'covered-features'
  }
  return null
}

export function hasSignificantSecondFace(
  faces: readonly { score: number; width: number; height: number }[], imageArea: number,
) {
  return faces.slice(1).some(face => face.score >= 0.45 && face.width * face.height / imageArea >= 0.018)
}

export function validPreparedPhoto(file: File) {
  return file.type === 'image/jpeg' && file.size > 0 && file.size <= PREPARED_MAX_BYTES
}
