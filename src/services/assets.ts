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
const FACE_AUTO_CROP_MIN_EDGE = Math.max(512, FACE_UPLOAD_MIN_EDGE)
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
const FACE_ROLL_MAX_DEGREES = 25
const FACE_NOSE_CENTER_MIN = 0.08
const FACE_NOSE_CENTER_MAX = 0.92
const FACE_BLUR_MIN_SCORE = 30
const FACE_BRIGHTNESS_MIN = 45
const FACE_BRIGHTNESS_MAX = 218
const FACE_EYE_REGION_RATIO = 0.22
const FACE_EYE_MIN_EDGE_SCORE = 4
const FACE_AUTO_CROP_SIDE_MARGIN_RATIO = 0.8
const FACE_AUTO_CROP_TOP_MARGIN_RATIO = 0.8
const FACE_AUTO_CROP_BOTTOM_MARGIN_RATIO = 1.25

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

export type FaceImageFaceMetrics = {
  originX: number
  originY: number
  width: number
  height: number
  areaRatio: number
  centerX: number
  centerY: number
  score: number
}

export type FaceImageAnalysis = {
  width: number
  height: number
  brightness?: number
  blurScore?: number
  detectedFaceCount?: number
  hasSignificantSecondFace?: boolean
  face?: FaceImageFaceMetrics
  autoCropCandidate?: boolean
}

export type FaceImageValidationResult = {
  ok: boolean
  code?: FaceImageValidationCode
  message?: string
  analysis?: FaceImageAnalysis
}

type FaceCropRect = {
  x: number
  y: number
  width: number
  height: number
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

function getFaceMetrics(detection: Detection, width: number, height: number): FaceImageFaceMetrics | null {
  const box = detection.boundingBox
  if (!box) return null
  const imageArea = width * height
  return {
    originX: box.originX,
    originY: box.originY,
    width: box.width,
    height: box.height,
    areaRatio: imageArea ? (box.width * box.height) / imageArea : 0,
    centerX: width ? (box.originX + box.width / 2) / width : 0,
    centerY: height ? (box.originY + box.height / 2) / height : 0,
    score: getDetectionScore(detection),
  }
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

function validateDetectedFace(
  detection: Detection,
  width: number,
  height: number,
  options: { ignoreAutoCropFixable?: boolean } = {}
): FaceImageValidationResult {
  const box = detection.boundingBox
  if (!box) return { ok: false, code: 'noFace' }

  const metrics = getFaceMetrics(detection, width, height)
  if (!metrics) return { ok: false, code: 'noFace' }
  const edgeMarginX = Math.max(2, width * 0.01)
  const edgeMarginY = Math.max(2, height * 0.01)

  if (
    !options.ignoreAutoCropFixable &&
    (Math.min(box.width, box.height) < FACE_MIN_BOX_EDGE || metrics.areaRatio < FACE_MIN_AREA_RATIO)
  ) {
    return { ok: false, code: 'faceTooSmall' }
  }
  if (metrics.areaRatio > FACE_MAX_AREA_RATIO) {
    return { ok: false, code: 'faceTooLarge' }
  }
  if (
    !options.ignoreAutoCropFixable &&
    (metrics.centerX < FACE_CENTER_MIN_X ||
      metrics.centerX > FACE_CENTER_MAX_X ||
      metrics.centerY < FACE_CENTER_MIN_Y ||
      metrics.centerY > FACE_CENTER_MAX_Y)
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

  if (!leftEye || !rightEye || !nose) {
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
  const mouthPosition = mouth ? (mouth.x - minEyeX) / eyeDistance : 0.5
  if (
    nosePosition < FACE_NOSE_CENTER_MIN ||
    nosePosition > FACE_NOSE_CENTER_MAX ||
    mouthPosition < -0.25 ||
    mouthPosition > 1.25
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

function isAutoCropFixableCode(code?: FaceImageValidationCode): boolean {
  return code === 'faceTooSmall' || code === 'faceNotCentered'
}

export async function faceQualityCheck(file: File): Promise<FaceImageValidationResult> {
  if (typeof window === 'undefined') return { ok: true }

  try {
    const image = await decodeImageFile(file)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const analysis: FaceImageAnalysis = { width, height }
    if (!width || !height) {
      return { ok: false, code: 'unreadable', message: 'We could not read this photo. Please try another image.', analysis }
    }

    const analysisCanvas = createAnalysisCanvas(image)
    const imageQuality = analysisCanvas ? measureImageQuality(analysisCanvas) : null
    if (imageQuality) {
      analysis.brightness = imageQuality.brightness
      analysis.blurScore = imageQuality.blurScore
      if (imageQuality.brightness < FACE_BRIGHTNESS_MIN) {
        return { ok: false, code: 'tooDark', analysis }
      }
      if (imageQuality.brightness > FACE_BRIGHTNESS_MAX) {
        return { ok: false, code: 'tooBright', analysis }
      }
      if (imageQuality.blurScore < FACE_BLUR_MIN_SCORE) {
        return { ok: false, code: 'tooBlurry', analysis }
      }
    }

    const detector = await getFaceDetector()
    const result = await withMediapipeNoiseSuppressed(() => detector.detect(image))
    const detections = [...result.detections].sort((a, b) => getDetectionScore(b) - getDetectionScore(a))
    analysis.detectedFaceCount = detections.length
    if (detections.length === 0) {
      return { ok: false, code: 'noFace', analysis }
    }
    analysis.face = getFaceMetrics(detections[0], width, height) ?? undefined
    analysis.hasSignificantSecondFace = hasSignificantSecondFace(detections, width * height)
    if (analysis.hasSignificantSecondFace) {
      return { ok: false, code: 'multipleFaces', analysis }
    }

    const faceValidation = validateDetectedFace(detections[0], width, height)
    if (!faceValidation.ok) {
      if (isAutoCropFixableCode(faceValidation.code)) {
        const terminalValidation = validateDetectedFace(detections[0], width, height, {
          ignoreAutoCropFixable: true,
        })
        const eyesOpen = !analysisCanvas || checkEyesOpen(detections[0], analysisCanvas, height)
        analysis.autoCropCandidate = terminalValidation.ok && eyesOpen && detections.length === 1
      }
      return { ...faceValidation, analysis }
    }

    if (analysisCanvas && !checkEyesOpen(detections[0], analysisCanvas, height)) {
      return { ok: false, code: 'eyesClosed', analysis }
    }

    return { ok: true, analysis }
  } catch (error) {
    console.warn('[face-quality] Photo check failed', error)
    return { ok: false, code: 'checkUnavailable', message: 'We could not check this photo. Please try again.' }
  }
}

function computeAutoCropRect(analysis: FaceImageAnalysis | undefined): FaceCropRect | null {
  const face = analysis?.face
  if (!analysis || !face) return null
  if (Math.min(face.width, face.height) < FACE_MIN_BOX_EDGE) return null

  const desiredLeft = face.originX - face.width * FACE_AUTO_CROP_SIDE_MARGIN_RATIO
  const desiredRight = face.originX + face.width * (1 + FACE_AUTO_CROP_SIDE_MARGIN_RATIO)
  const desiredTop = face.originY - face.height * FACE_AUTO_CROP_TOP_MARGIN_RATIO
  const desiredBottom = face.originY + face.height * (1 + FACE_AUTO_CROP_BOTTOM_MARGIN_RATIO)

  if (
    desiredLeft < 0 ||
    desiredTop < 0 ||
    desiredRight > analysis.width ||
    desiredBottom > analysis.height
  ) {
    return null
  }

  const desiredWidth = desiredRight - desiredLeft
  const desiredHeight = desiredBottom - desiredTop
  const side = Math.max(desiredWidth, desiredHeight)
  if (side < FACE_AUTO_CROP_MIN_EDGE || side > analysis.width || side > analysis.height) {
    return null
  }

  const desiredCenterX = (desiredLeft + desiredRight) / 2
  const desiredCenterY = (desiredTop + desiredBottom) / 2
  let x = desiredCenterX - side / 2
  let y = desiredCenterY - side / 2

  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x + side > analysis.width) x = analysis.width - side
  if (y + side > analysis.height) y = analysis.height - side

  if (x > desiredLeft || y > desiredTop || x + side < desiredRight || y + side < desiredBottom) {
    return null
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(side),
    height: Math.round(side),
  }
}

type PrepareFaceImageOptions = {
  cropRect?: FaceCropRect | null
  nameSuffix?: string
}

export async function prepareFaceImage(file: File, options: PrepareFaceImageOptions = {}): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (typeof window === 'undefined') return file

  try {
    const image = await decodeImageFile(file)

    const originalWidth = image.naturalWidth || image.width
    const originalHeight = image.naturalHeight || image.height
    if (!originalWidth || !originalHeight) return file

    const cropRect = options.cropRect ?? null
    const sourceX = cropRect ? Math.max(0, Math.min(originalWidth - 1, cropRect.x)) : 0
    const sourceY = cropRect ? Math.max(0, Math.min(originalHeight - 1, cropRect.y)) : 0
    const sourceWidth = cropRect
      ? Math.max(1, Math.min(originalWidth - sourceX, cropRect.width))
      : originalWidth
    const sourceHeight = cropRect
      ? Math.max(1, Math.min(originalHeight - sourceY, cropRect.height))
      : originalHeight

    const maxEdge = Math.max(sourceWidth, sourceHeight)
    const scale = maxEdge > FACE_UPLOAD_MAX_EDGE ? FACE_UPLOAD_MAX_EDGE / maxEdge : 1
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    if (!cropRect && scale >= 1 && file.size <= FACE_UPLOAD_TARGET_BYTES) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', FACE_UPLOAD_JPEG_QUALITY)
    )
    if (!blob) return file
    if (!cropRect && blob.size >= file.size && file.size <= FACE_UPLOAD_TARGET_BYTES) {
      return file
    }

    const baseName = file.name.replace(/\.[^.]+$/, '')
    const suffix = options.nameSuffix ? `-${options.nameSuffix}` : ''
    const optimizedName = `${baseName}${suffix}.jpg`
    return new File([blob], optimizedName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

export async function autoCropFaceImage(file: File, analysis: FaceImageAnalysis | undefined): Promise<File | null> {
  const cropRect = computeAutoCropRect(analysis)
  if (!cropRect) return null
  const prepared = await prepareFaceImage(file, { cropRect, nameSuffix: 'centered' })
  return prepared === file ? null : prepared
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
