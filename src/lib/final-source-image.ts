import sharp from 'sharp'

export const DEFAULT_FINAL_SOURCE_MIN_EDGE = 512
export const FINAL_SOURCE_SQUARE_TOLERANCE = 0.02

const SUPPORTED_FINAL_SOURCE_FORMATS = new Set(['jpeg', 'png', 'webp'])

export type FinalSourceDimensions = {
  width: number
  height: number
}

export class FinalSourceImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinalSourceImageError'
  }
}

function orientedDimensions(metadata: Awaited<ReturnType<sharp.Sharp['metadata']>>): FinalSourceDimensions {
  const width = Number(metadata.width || 0)
  const height = Number(metadata.height || 0)
  const swapsAxes = metadata.orientation != null && metadata.orientation >= 5 && metadata.orientation <= 8
  return swapsAxes ? { width: height, height: width } : { width, height }
}

export function isApproximatelySquareFinalSource({ width, height }: FinalSourceDimensions) {
  return Math.abs(width - height) / Math.max(width, height) <= FINAL_SOURCE_SQUARE_TOLERANCE
}

export async function inspectFinalSourceImage(args: {
  buffer: Buffer
  label: string
  minSourceEdge?: number
}): Promise<FinalSourceDimensions & { format: 'jpeg' | 'png' | 'webp' }> {
  if (!Buffer.isBuffer(args.buffer) || args.buffer.length === 0) {
    throw new FinalSourceImageError(`${args.label} has no image bytes`)
  }

  let metadata
  try {
    metadata = await sharp(args.buffer, { failOn: 'error' }).metadata()
  } catch {
    throw new FinalSourceImageError(`${args.label} is not a readable image`)
  }

  const format = String(metadata.format || '')
  if (!SUPPORTED_FINAL_SOURCE_FORMATS.has(format)) {
    throw new FinalSourceImageError(`${args.label} must be a PNG, JPEG, or WebP image`)
  }

  const dimensions = orientedDimensions(metadata)
  if (!dimensions.width || !dimensions.height) {
    throw new FinalSourceImageError(`${args.label} has invalid dimensions`)
  }
  if (args.minSourceEdge && Math.min(dimensions.width, dimensions.height) < args.minSourceEdge) {
    throw new FinalSourceImageError(
      `${args.label} is below the minimum ${args.minSourceEdge}px source edge`
    )
  }

  return {
    ...dimensions,
    format: format as 'jpeg' | 'png' | 'webp',
  }
}

export async function prepareFinalReplacementImage(args: {
  buffer: Buffer
  label: string
  structured: boolean
  expectedInteriorSource?: FinalSourceDimensions | null
}) {
  const source = await inspectFinalSourceImage({
    buffer: args.buffer,
    label: args.label,
    minSourceEdge: args.structured ? DEFAULT_FINAL_SOURCE_MIN_EDGE : undefined,
  })

  if (args.structured && !isApproximatelySquareFinalSource(source)) {
    throw new FinalSourceImageError(
      `${args.label} must be approximately square (received ${source.width}x${source.height})`
    )
  }
  if (
    args.structured &&
    args.expectedInteriorSource &&
    (source.width !== args.expectedInteriorSource.width || source.height !== args.expectedInteriorSource.height)
  ) {
    throw new FinalSourceImageError(
      `${args.label} geometry must match the other Final interiors (${args.expectedInteriorSource.width}x${args.expectedInteriorSource.height})`
    )
  }

  const buffer = await sharp(args.buffer, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer()

  return { buffer, source }
}
