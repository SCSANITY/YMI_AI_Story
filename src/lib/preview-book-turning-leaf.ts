export type PreviewBookPageSide = 'left' | 'right'

export type PreviewBookPageAddress = Readonly<{
  side: PreviewBookPageSide
  spreadIndex: number
}>

export type PreviewBookTurningLeafFaces = Readonly<{
  front: PreviewBookPageAddress
  back: PreviewBookPageAddress
}>

/**
 * A physical leaf always keeps the same two page images on its two faces.
 * Direction changes only the rotation, never the face-to-page assignment.
 */
export function resolvePreviewBookTurningLeafFaces(
  currentSpread: number,
  direction: 'next' | 'prev' | null,
): PreviewBookTurningLeafFaces | null {
  if (!Number.isInteger(currentSpread) || currentSpread < 0 || !direction) return null

  if (direction === 'next') {
    return {
      front: { side: 'right', spreadIndex: currentSpread },
      back: { side: 'left', spreadIndex: currentSpread + 1 },
    }
  }

  if (currentSpread === 0) return null
  return {
    front: { side: 'right', spreadIndex: currentSpread - 1 },
    back: { side: 'left', spreadIndex: currentSpread },
  }
}
