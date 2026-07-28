function normalizePublicId(value: string | undefined, pattern: RegExp) {
  const normalized = String(value ?? '').trim()
  return pattern.test(normalized) ? normalized : null
}

export const TRACKING_CONFIG = Object.freeze({
  ga4MeasurementId: normalizePublicId(
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
    /^G-[A-Z0-9]+$/,
  ),
  googleAdsId: normalizePublicId(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    /^AW-[0-9]+$/,
  ),
  metaPixelId: normalizePublicId(
    process.env.NEXT_PUBLIC_META_PIXEL_ID,
    /^[0-9]{5,24}$/,
  ),
})

export const META_TRACKING_FRAME_PATH = '/tracking/meta-frame'
