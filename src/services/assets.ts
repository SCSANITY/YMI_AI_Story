import { supabase } from '@/lib/supabase'

export type AssetType = 'face_image' | 'text_profile' | 'voice_sample' | 'profile_avatar'

export interface UserAssetRecord {
  asset_id: string
  owner_type: 'anon' | 'customer'
  anon_session_id?: string | null
  customer_id?: string | null
  asset_type: AssetType
  storage_path: string
  signed_url?: string
  created_at?: string
}

export type PendingUserAssetUpload = {
  asset_id: string
  storage_path: string
  bucket: string
  asset_type: AssetType
  role: 'face' | 'text' | 'voice' | 'avatar'
  original_name: string
  content_type: string
}

const FACE_UPLOAD_MAX_EDGE = 1400
const FACE_UPLOAD_TARGET_BYTES = 2 * 1024 * 1024
const FACE_UPLOAD_JPEG_QUALITY = 0.88
const FACE_UPLOAD_MIN_EDGE = 320

export type FaceImageValidationResult = {
  ok: boolean
  message?: string
}

async function decodeImageFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function validateFaceImage(file: File): Promise<FaceImageValidationResult> {
  if (!file) return { ok: false, message: 'Please upload a photo.' }
  if (!file.type.startsWith('image/')) {
    return { ok: false, message: 'Please upload an image file.' }
  }
  if (typeof window === 'undefined') return { ok: true }

  try {
    const image = await decodeImageFile(file)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      return { ok: false, message: 'We could not read this photo. Please try another image.' }
    }
    if (Math.min(width, height) < FACE_UPLOAD_MIN_EDGE) {
      return {
        ok: false,
        message: 'This photo is too small. Please upload a clearer, higher-resolution face photo.',
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'We could not read this photo. Please try another image.' }
  }
}

export async function faceQualityCheck(file: File): Promise<FaceImageValidationResult> {
  // Placeholder for the next layer of validation: face visibility, blur, occlusion, etc.
  void file
  return { ok: true }
}

export async function prepareFaceImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (typeof window === 'undefined') return file

  try {
    const image = await decodeImageFile(file)

    const originalWidth = image.naturalWidth || image.width
    const originalHeight = image.naturalHeight || image.height
    if (!originalWidth || !originalHeight) return file

    const maxEdge = Math.max(originalWidth, originalHeight)
    const scale = maxEdge > FACE_UPLOAD_MAX_EDGE ? FACE_UPLOAD_MAX_EDGE / maxEdge : 1
    const width = Math.max(1, Math.round(originalWidth * scale))
    const height = Math.max(1, Math.round(originalHeight * scale))

    if (scale >= 1 && file.size <= FACE_UPLOAD_TARGET_BYTES) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', FACE_UPLOAD_JPEG_QUALITY)
    )
    if (!blob) return file
    if (blob.size >= file.size && file.size <= FACE_UPLOAD_TARGET_BYTES) {
      return file
    }

    const baseName = file.name.replace(/\.[^.]+$/, '')
    const optimizedName = `${baseName}.jpg`
    return new File([blob], optimizedName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

type UserAssetRole = 'face' | 'text' | 'voice' | 'avatar'

type UploadUserAssetOptions = {
  skipFacePreparation?: boolean
  originalName?: string
  onTiming?: (label: string, details?: Record<string, unknown>) => void
}

export async function uploadUserAsset(
  file: File,
  type: AssetType,
  role: UserAssetRole,
  customerId: string | undefined,
  options: UploadUserAssetOptions & { deferConfirm: true }
): Promise<PendingUserAssetUpload>

export async function uploadUserAsset(
  file: File,
  type: AssetType,
  role: UserAssetRole,
  customerId?: string,
  options?: UploadUserAssetOptions & { deferConfirm?: false }
): Promise<UserAssetRecord>

export async function uploadUserAsset(
  file: File,
  type: AssetType,
  role: UserAssetRole,
  customerId?: string,
  options?: UploadUserAssetOptions & { deferConfirm?: boolean }
): Promise<UserAssetRecord | PendingUserAssetUpload> {
  if (!file) throw new Error('File is required')
  const uploadFile =
    type === 'face_image' && !options?.skipFacePreparation
      ? await prepareFaceImage(file)
      : file

  const response = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_type: type,
      role,
      customerId: customerId ?? null,
      file_name: uploadFile.name,
      content_type: uploadFile.type || 'application/octet-stream',
    }),
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('Upload failed')
  }

  const uploadSpec = await response.json()
  const bucket = uploadSpec?.bucket || 'raw-private'
  const storagePath = uploadSpec?.storage_path
  const token = uploadSpec?.token
  const assetId = uploadSpec?.asset_id

  if (!storagePath || !token || !assetId) {
    throw new Error('Upload spec is incomplete')
  }

  options?.onTiming?.('upload_url_ready', {
    assetId,
    storagePath,
    contentType: uploadFile.type || 'application/octet-stream',
    bytes: uploadFile.size,
  })

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(storagePath, token, uploadFile)

  if (uploadError) {
    throw new Error('Upload failed')
  }

  options?.onTiming?.('storage_upload_done', {
    assetId,
    storagePath,
    bytes: uploadFile.size,
  })

  if (options?.deferConfirm) {
    return {
      asset_id: assetId,
      storage_path: storagePath,
      bucket,
      asset_type: type,
      role,
      original_name: options?.originalName ?? file.name,
      content_type: uploadFile.type || 'application/octet-stream',
    }
  }

  const confirmResponse = await fetch('/api/user-assets/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      asset_id: assetId,
      storage_path: storagePath,
      asset_type: type,
      role,
      customerId: customerId ?? null,
      original_name: options?.originalName ?? file.name,
      content_type: uploadFile.type || 'application/octet-stream',
    }),
  })

  if (!confirmResponse.ok) {
    throw new Error('Failed to confirm upload')
  }

  return (await confirmResponse.json()) as UserAssetRecord
}
