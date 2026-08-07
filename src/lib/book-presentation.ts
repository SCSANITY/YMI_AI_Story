export type BookLeafSide = 'left' | 'right'

export type BookLeafRole =
  | 'preview_cover'
  | 'preview_interior'
  | 'final_back_cover'
  | 'final_front_cover'
  | 'final_interior'

export type BookLeafSource =
  | { layout: 'single-page' }
  | { layout: 'spread-crop'; side: BookLeafSide }

export type BookLeaf = {
  id: string
  url: string
  role: BookLeafRole
  spreadIndex: number
  side: BookLeafSide | null
  pageIndex?: number
  previewOrder?: number
  outputOrder?: number
  pageNumber?: number | null
  source: BookLeafSource
}

export type BookSpread = {
  spreadIndex: number
  displayIndex?: number
  left: BookLeaf | null
  right: BookLeaf | null
}

export type BookPresentation = {
  cover: BookLeaf | null
  spreads: BookSpread[]
}

export function buildBookPresentation(
  leaves: BookLeaf[],
  options: {
    coverRole: 'preview_cover' | 'final_front_cover'
    interiorRole: 'preview_interior' | 'final_interior'
  }
): BookPresentation {
  const covers = leaves.filter((leaf) => leaf.role === options.coverRole)
  if (covers.length > 1) {
    throw new Error(`Duplicate ${options.coverRole} leaves`)
  }

  const spreads = new Map<number, BookSpread>()
  for (const leaf of leaves) {
    if (leaf.role !== options.interiorRole) continue
    if (!leaf.side || leaf.spreadIndex < 1) {
      throw new Error(`Invalid ${options.interiorRole} leaf ${leaf.id}`)
    }
    if (leaf.source.layout === 'spread-crop' && leaf.source.side !== leaf.side) {
      throw new Error(`Mismatched crop side for leaf ${leaf.id}`)
    }

    const spread = spreads.get(leaf.spreadIndex) ?? {
      spreadIndex: leaf.spreadIndex,
      left: null,
      right: null,
    }
    if (spread[leaf.side]) {
      throw new Error(`Duplicate spread ${leaf.spreadIndex} ${leaf.side} leaf`)
    }
    spread[leaf.side] = leaf
    spreads.set(leaf.spreadIndex, spread)
  }

  return {
    cover: covers[0] ?? null,
    spreads: [...spreads.values()].sort((a, b) => a.spreadIndex - b.spreadIndex),
  }
}

export function resolveBookLeaf(
  presentation: BookPresentation | null | undefined,
  spreadIndex: number,
  side: BookLeafSide
): BookLeaf | null {
  if (!presentation) return null
  if (spreadIndex === 0) return side === 'right' ? presentation.cover : null
  const spread = presentation.spreads.find(
    (candidate) => (candidate.displayIndex ?? candidate.spreadIndex) === spreadIndex
  )
  return spread?.[side] ?? null
}

export function createLegacySpreadLeaf(
  url: string,
  spreadIndex: number,
  side: BookLeafSide,
  role: 'preview_interior' | 'final_interior' = 'preview_interior'
): BookLeaf {
  return {
    id: `legacy-spread-${spreadIndex}-${side}`,
    url,
    role,
    spreadIndex,
    side,
    source: { layout: 'spread-crop', side },
  }
}
