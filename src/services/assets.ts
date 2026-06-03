import { supabase } from '@/lib/supabase'
import type { Detection, FaceDetector } from '@mediapipe/tasks-vision'

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
const FACE_UPLOAD_MIN_BYTES = 100 * 1024
const FACE_DETECTOR_WASM_URL = '/mediapipe/tasks-vision/wasm'
const FACE_DETECTOR_MODEL_URL = '/mediapipe/models/blaze_face_short_range.tflite'
const FACE_DETECTION_MIN_CONFIDENCE = 0.55
const FACE_QUALITY_SAMPLE_EDGE = 420
const FACE_MIN_AREA_RATIO = 0.045
const FACE_MAX_AREA_RATIO = 0.68
const FACE_MIN_BOX_EDGE = 110
const FACE_CENTER_MIN_X = 0.22
const FACE_CENTER_MAX_X = 0.78
const FACE_CENTER_MIN_Y = 0.18
const FACE_CENTER_MAX_Y = 0.74
const FACE_ROLL_MAX_DEGREES = 18
const FACE_NOSE_CENTER_MIN = 0.18
const FACE_NOSE_CENTER_MAX = 0.82
const FACE_BLUR_MIN_SCORE = 30
const FACE_BRIGHTNESS_MIN = 45
const FACE_BRIGHTNESS_MAX = 218
const FACE_EYE_REGION_RATIO = 0.22
const FACE_EYE_MIN_EDGE_SCORE = 8

export type FaceImageValidationCode =
  | 'missing'
  | 'notImage'
  | 'unreadable'
  | 'tooSmall'
  | 'checkUnavailable'
  | 'noFace'
  | 'multipleFaces'
  | 'faceTooSmall'
  | 'faceTooLarge'
  | 'faceNotCentered'
  | 'faceCropped'
  | 'notFrontFacing'
  | 'faceCovered'
  | 'tooBlurry'
  | 'tooDark'
  | 'tooBright'
  | 'eyesClosed'

export type FaceImageValidationResult = {
  ok: boolean
  code?: FaceImageValidationCode
  message?: string
}

let faceDetectorPromise: Promise<FaceDetector> | null = null

function isMediapipeNoiseLog(args: unknown[]): boolean {
  return args.some((arg) => {
    if (typeof arg !== 'string') return false
    return (
      arg.includes('Created TensorFlow Lite XNNPACK delegate for CPU') ||
      arg.includes('INFO: Created TensorFlow Lite')
    )
  })
}

async function withMediapipeNoiseSuppressed<T>(run: () => T | Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return run()

  const originalError = console.error
  console.error = (...args: unknown[]) => {
    if (isMediapipeNoiseLog(args)) return
    originalError(...args)
  }

  try {
    return await run()
  } finally {
    console.error = originalError
  }
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

async function getFaceDetector(): Promise<FaceDetector> {
  faceDetectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(FACE_DETECTOR_WASM_URL)
    return withMediapipeNoiseSuppressed(() =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: {
          delegate: 'CPU',
          modelAssetPath: FACE_DETECTOR_MODEL_URL,
        },
        minDetectionConfidence: FACE_DETECTION_MIN_CONFIDENCE,
        minSuppressionThreshold: 0.3,
        runningMode: 'IMAGE',
      })
    )
  })().catch((error) => {
    faceDetectorPromise = null
    throw error
  })
  return faceDetectorPromise
}

function createAnalysisCanvas(image: HTMLImageElement): HTMLCanvasElement | null {
  const originalWidth = image.naturalWidth || image.width
  const originalHeight = image.naturalHeight || image.height
  if (!originalWidth || !originalHeight) return null

  const scale = FACE_QUALITY_SAMPLE_EDGE / Math.max(originalWidth, originalHeight)
  const width = Math.max(1, Math.round(originalWidth * Math.min(scale, 1)))
  const height = Math.max(1, Math.round(originalHeight * Math.min(scale, 1)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

function measureImageQuality(canvas: HTMLCanvasElement): { brightness: number; blurScore: number } | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  const grayscale = new Float32Array(width * height)

  let brightnessSum = 0
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const value = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    grayscale[pixel] = value
    brightnessSum += value
  }

  let edgeEnergy = 0
  let count = 0
  for (let y = 1; y < height; y += 2) {
    for (let x = 1; x < width; x += 2) {
      const current = grayscale[y * width + x]
      const gx = current - grayscale[y * width + x - 1]
      const gy = current - grayscale[(y - 1) * width + x]
      edgeEnergy += gx * gx + gy * gy
      count += 1
    }
  }

  return {
    brightness: brightnessSum / grayscale.length,
    blurScore: count ? edgeEnergy / count : 0,
  }
}

function measureRegionEdgeScore(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): number {
  const x = Math.max(0, Math.round(cx - size / 2))
  const y = Math.max(0, Math.round(cy - size / 2))
  const w = Math.min(ctx.canvas.width - x, Math.max(1, Math.round(size)))
  const h = Math.min(ctx.canvas.height - y, Math.max(1, Math.round(size)))
  if (w <= 2 || h <= 2) return 100
  const data = ctx.getImageData(x, y, w, h).data
  const gs = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gs[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  let energy = 0
  let count = 0
  for (let row = 1; row < h; row++) {
    for (let col = 1; col < w; col++) {
      const idx = row * w + col
      const gx = gs[idx] - gs[idx - 1]
      const gy = gs[idx] - gs[idx - w]
      energy += gx * gx + gy * gy
      count++
    }
  }
  return count ? energy / count : 0
}

function checkEyesOpen(
  detection: Detection,
  analysisCanvas: HTMLCanvasElement,
  originalHeight: number
): boolean {
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true
  const box = detection.boundingBox
  if (!box) return true
  const leftEye = getKeypointByLabel(detection, ['left eye', 'lefteye'], 0)
  const rightEye = getKeypointByLabel(detection, ['right eye', 'righteye'], 1)
  if (!leftEye || !rightEye) return true
  const canvasScale = analysisCanvas.height / originalHeight
  const regionSize = box.height * canvasScale * FACE_EYE_REGION_RATIO
  const leftScore = measureRegionEdgeScore(
    ctx,
    leftEye.x * analysisCanvas.width,
    leftEye.y * analysisCanvas.height,
    regionSize
  )
  const rightScore = measureRegionEdgeScore(
    ctx,
    rightEye.x * analysisCanvas.width,
    rightEye.y * analysisCanvas.height,
    regionSize
  )
  return leftScore >= FACE_EYE_MIN_EDGE_SCORE || rightScore >= FACE_EYE_MIN_EDGE_SCORE
}

function getDetectionScore(detection: Detection): number {
  return detection.categories[0]?.score ?? 0
}

function hasSignificantSecondFace(detections: Detection[], imageArea: number): boolean {
  return detections.slice(1).some((detection) => {
    const box = detection.boundingBox
    if (!box) return false
    const areaRatio = (box.width * box.height) / imageArea
    return getDetectionScore(detection) >= 0.45 && areaRatio >= 0.018
  })
}

function getKeypointByLabel(detection: Detection, labels: string[], fallbackIndex: number) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())
  const keypoint = detection.keypoints.find((item) => {
    const label = item.label?.toLowerCase() ?? ''
    return normalizedLabels.some((candidate) => label.includes(candidate))
  })
  return keypoint ?? detection.keypoints[fallbackIndex]
}

function validateDetectedFace(detection: Detection, width: number, height: number): FaceImageValidationResult {
  const box = detection.boundingBox
  if (!box) return { ok: false, code: 'noFace' }

  const imageArea = width * height
  const faceAreaRatio = (box.width * box.height) / imageArea
  const centerX = (box.originX + box.width / 2) / width
  const centerY = (box.originY + box.height / 2) / height
  const edgeMarginX = Math.max(2, width * 0.01)
  const edgeMarginY = Math.max(2, height * 0.01)

  if (Math.min(box.width, box.height) < FACE_MIN_BOX_EDGE || faceAreaRatio < FACE_MIN_AREA_RATIO) {
    return { ok: false, code: 'faceTooSmall' }
  }
  if (faceAreaRatio > FACE_MAX_AREA_RATIO) {
    return { ok: false, code: 'faceTooLarge' }
  }
  if (
    centerX < FACE_CENTER_MIN_X ||
    centerX > FACE_CENTER_MAX_X ||
    centerY < FACE_CENTER_MIN_Y ||
    centerY > FACE_CENTER_MAX_Y
  ) {
    return { ok: false, code: 'faceNotCentered' }
  }
  if (
    box.originX <= edgeMarginX ||
    box.originY <= edgeMarginY ||
    box.originX + box.width >= width - edgeMarginX ||
    box.originY + box.height >= height - edgeMarginY
  ) {
    return { ok: false, code: 'faceCropped' }
  }

  const leftEye = getKeypointByLabel(detection, ['left eye', 'lefteye'], 0)
  const rightEye = getKeypointByLabel(detection, ['right eye', 'righteye'], 1)
  const nose = getKeypointByLabel(detection, ['nose'], 2)
  const mouth = getKeypointByLabel(detection, ['mouth'], 3)

  if (!leftEye || !rightEye || !nose || !mouth) {
    return { ok: false, code: 'faceCovered' }
  }

  const eyeDx = rightEye.x - leftEye.x
  const eyeDy = rightEye.y - leftEye.y
  const roll = Math.abs((Math.atan2(eyeDy, eyeDx) * 180) / Math.PI)
  if (roll > FACE_ROLL_MAX_DEGREES && roll < 180 - FACE_ROLL_MAX_DEGREES) {
    return { ok: false, code: 'notFrontFacing' }
  }

  const minEyeX = Math.min(leftEye.x, rightEye.x)
  const maxEyeX = Math.max(leftEye.x, rightEye.x)
  const eyeDistance = Math.max(0.001, maxEyeX - minEyeX)
  const nosePosition = (nose.x - minEyeX) / eyeDistance
  const mouthPosition = (mouth.x - minEyeX) / eyeDistance
  if (
    nosePosition < FACE_NOSE_CENTER_MIN ||
    nosePosition > FACE_NOSE_CENTER_MAX ||
    mouthPosition < -0.1 ||
    mouthPosition > 1.1
  ) {
    return { ok: false, code: 'notFrontFacing' }
  }

  return { ok: true }
}

export async function validateFaceImage(file: File): Promise<FaceImageValidationResult> {
  if (!file) return { ok: false, code: 'missing', message: 'Please upload a photo.' }
  if (!file.type.startsWith('image/')) {
    return { ok: false, code: 'notImage', message: 'Please upload an image file.' }
  }
  if (file.size < FACE_UPLOAD_MIN_BYTES) {
    return {
      ok: false,
      code: 'tooSmall',
      message: 'This photo is too small. Please upload a clear face photo that is at least 100KB and 320px wide/tall.',
    }
  }
  if (typeof window === 'undefined') return { ok: true }

  try {
    const image = await decodeImageFile(file)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      return { ok: false, code: 'unreadable', message: 'We could not read this photo. Please try another image.' }
    }
    if (Math.min(width, height) < FACE_UPLOAD_MIN_EDGE) {
      return {
        ok: false,
        code: 'tooSmall',
        message: 'This photo is too small. Please upload a clear face photo that is at least 100KB and 320px wide/tall.',
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'unreadable', message: 'We could not read this photo. Please try another image.' }
  }
}

export async function faceQualityCheck(file: File): Promise<FaceImageValidationResult> {
  if (typeof window === 'undefined') return { ok: true }

  try {
    const image = await decodeImageFile(file)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      return { ok: false, code: 'unreadable', message: 'We could not read this photo. Please try another image.' }
    }

    const analysisCanvas = createAnalysisCanvas(image)
    const imageQuality = analysisCanvas ? measureImageQuality(analysisCanvas) : null
    if (imageQuality) {
      if (imageQuality.brightness < FACE_BRIGHTNESS_MIN) {
        return { ok: false, code: 'tooDark' }
      }
      if (imageQuality.brightness > FACE_BRIGHTNESS_MAX) {
        return { ok: false, code: 'tooBright' }
      }
      if (imageQuality.blurScore < FACE_BLUR_MIN_SCORE) {
        return { ok: false, code: 'tooBlurry' }
      }
    }

    const detector = await getFaceDetector()
    const result = await withMediapipeNoiseSuppressed(() => detector.detect(image))
    const detections = [...result.detections].sort((a, b) => getDetectionScore(b) - getDetectionScore(a))
    if (detections.length === 0) {
      return { ok: false, code: 'noFace' }
    }
    if (hasSignificantSecondFace(detections, width * height)) {
      return { ok: false, code: 'multipleFaces' }
    }

    const faceValidation = validateDetectedFace(detections[0], width, height)
    if (!faceValidation.ok) return faceValidation

    if (analysisCanvas && !checkEyesOpen(detections[0], analysisCanvas, height)) {
      return { ok: false, code: 'eyesClosed' }
    }

    return { ok: true }
  } catch (error) {
    console.warn('[face-quality] Photo check failed', error)
    return { ok: false, code: 'checkUnavailable', message: 'We could not check this photo. Please try again.' }
  }
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
