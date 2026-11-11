import { detectHeicContentType } from '../heic-upload'
import type { PhotoFailure } from './protocol'

export async function decodePhoto<T extends { width: number; height: number; close(): void }>(
  file: File,
  decode: (file: File) => Promise<T>,
): Promise<{ bitmap: T } | { reason: PhotoFailure }> {
  if (!file.size) return { reason: 'unreadable' }
  try {
    const bitmap = await decode(file)
    if (bitmap.width > 0 && bitmap.height > 0) return { bitmap }
    bitmap.close()
  } catch {
    // Only an actual decode failure may take the unsupported-HEIC path.
  }
  return { reason: await detectHeicContentType(file) ? 'heic-undecodable' : 'unreadable' }
}
