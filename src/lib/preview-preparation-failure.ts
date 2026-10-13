const PREPARATION_CODES = new Set([
  'preview_image_input_unsupported', 'preview_image_decode_failed',
  'preview_image_geometry_invalid', 'preview_image_preparation_failed',
])

export const PHOTO_PREPARATION_FAILURE_MESSAGE = "We couldn't prepare this photo. Please try another photo or upload a JPEG or PNG."

export function isPreviewPreparationFailure(value: unknown): boolean {
  return typeof value === 'string' && PREPARATION_CODES.has(value)
}
