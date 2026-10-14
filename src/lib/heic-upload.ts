import { validateUserAssetUpload } from '@/lib/userAssetsStorage'

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'])
const HEIF_BRANDS = new Set(['mif1', 'msf1'])

export class HeicUploadTooLargeError extends Error {
  constructor() {
    super('This file is too large. Please upload an image smaller than 5 MB.')
  }
}

export async function prepareUndecodableHeicUpload(args: {
  file: File
  canDecode: (file: File) => Promise<boolean>
}): Promise<File | null> {
  const header = new Uint8Array(await args.file.slice(0, 64).arrayBuffer())
  const text = (start: number) => String.fromCharCode(...header.slice(start, start + 4))
  if (header.length < 16 || text(4) !== 'ftyp') return null
  const brand = text(8)
  const compatible: string[] = []
  const declaredBoxSize = new DataView(header.buffer).getUint32(0)
  for (let p = 16; p + 4 <= Math.min(header.length, declaredBoxSize); p += 4) compatible.push(text(p))
  const heic = HEIC_BRANDS.has(brand) || compatible.some((value) => HEIC_BRANDS.has(value))
  if (!heic && !HEIF_BRANDS.has(brand)) return null
  if (await args.canDecode(args.file)) return null
  const contentType = heic ? 'image/heic' : 'image/heif'
  try {
    validateUserAssetUpload({ assetType: 'face_image', contentType, sizeBytes: args.file.size })
  } catch {
    // The detected HEIC/HEIF MIME and nonempty File are valid; only the size cap can fail here.
    throw new HeicUploadTooLargeError()
  }
  const stem = args.file.name.replace(/\.[^.]+$/, '') || 'photo'
  // Bytes remain original; only a missing/misleading browser MIME/name is fixed.
  return new File([args.file], `${stem}.${heic ? 'heic' : 'heif'}`, {
    type: contentType, lastModified: args.file.lastModified,
  })
}
