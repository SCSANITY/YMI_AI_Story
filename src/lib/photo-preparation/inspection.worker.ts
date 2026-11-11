import { FaceDetector, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { drawFrame, frameFace } from './geometry.mjs'
import { faceOccPlan, prepareFaceOcc } from './faceocc.mjs'
import { featureRegions, measureRegion } from './features.mjs'
import { decodePhoto } from './decode'
import { CROP_C, PHOTO_ASSET_BASE, checkFeatureVisibility, hasSignificantSecondFace, validPreparedPhoto } from './policy'
import type { InspectionResult, PhotoPhase, WorkerRequest, WorkerResponse } from './protocol'

type OrtTensor = { dims: readonly number[]; data: Float32Array; dispose(): void }
type OrtRuntime = {
  env: { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } }
  Tensor: new (type: 'float32', data: Float32Array, shape: number[]) => OrtTensor
  InferenceSession: { create(url: string, options: { executionProviders: ['wasm']; graphOptimizationLevel: 'all' }): Promise<{
    run(input: { image: OrtTensor }): Promise<Record<string, OrtTensor>>
  }> }
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void
  postMessage(message: WorkerResponse): void
}

let visionPending: ReturnType<typeof FilesetResolver.forVisionTasks> | undefined
let detectorPending: Promise<FaceDetector> | undefined
let landmarkPending: Promise<FaceLandmarker> | undefined
const vision = () => visionPending ??= FilesetResolver.forVisionTasks('/mediapipe/tasks-vision/wasm')
  .catch(error => { visionPending = undefined; throw error })
const detector = () => detectorPending ??= vision().then(files => FaceDetector.createFromOptions(files, {
  baseOptions: { modelAssetPath: '/mediapipe/models/blaze_face_short_range.tflite', delegate: 'CPU' },
  runningMode: 'IMAGE',
  minDetectionConfidence: 0.55,
  minSuppressionThreshold: 0.3,
})).catch(error => { detectorPending = undefined; throw error })
const landmarks = () => landmarkPending ??= vision().then(files => FaceLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: PHOTO_ASSET_BASE + 'face_landmarker.task', delegate: 'CPU' },
  runningMode: 'IMAGE',
  numFaces: 2,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
})).catch(error => { landmarkPending = undefined; throw error })

async function loadFaceOcc() {
  const url = PHOTO_ASSET_BASE + 'ort.wasm.min.mjs'
  const ort: OrtRuntime = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)
  ort.env.wasm.wasmPaths = PHOTO_ASSET_BASE
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const session = await ort.InferenceSession.create(PHOTO_ASSET_BASE + 'faceocc.onnx', {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  })
  return { ort, session }
}

let occPending: ReturnType<typeof loadFaceOcc> | undefined
const faceOcc = () => occPending ??= loadFaceOcc().catch(error => { occPending = undefined; throw error })

async function inspect(file: File, phase: (phase: PhotoPhase) => void): Promise<InspectionResult> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return { reason: 'technical' }
  }
  const decoded = await decodePhoto(file, value => createImageBitmap(value))
  if ('reason' in decoded) return decoded
  const { bitmap } = decoded
  try {
    const d = await detector()
    phase('checking')
    const faces = d.detect(bitmap).detections.flatMap(detection => {
      const box = detection.boundingBox
      const score = detection.categories[0]?.score
      return box && typeof score === 'number' && [box.originX, box.originY, box.width, box.height, score].every(Number.isFinite)
        && box.width > 0 && box.height > 0
        ? [{ x: box.originX, y: box.originY, width: box.width, height: box.height, score }] : []
    }).sort((a, b) => b.score - a.score)
    if (!faces.length) return { reason: 'no-face' }
    if (hasSignificantSecondFace(faces, bitmap.width * bitmap.height)) return { reason: 'multiple-faces' }
    const face = faces[0]
    const plan = faceOccPlan(bitmap.width, bitmap.height, face)
    if (!plan.visibleFaceIncluded) return { reason: 'incomplete-face' }
    const input = new OffscreenCanvas(256, 256)
    const ctx = input.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas unavailable')
    const r = plan.source
    ctx.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, 256, 256)
    const model = await landmarks()
    const aligned = await createImageBitmap(input)
    let points
    try {
      const result = model.detect(aligned).faceLandmarks
      if (result.length !== 1) return { reason: 'unmeasurable-face' }
      points = result[0]
    } finally { aligned.close() }
    const nose = points[1]
    if (!nose) return { reason: 'unmeasurable-face' }
    const x = r.x + nose.x * r.width, y = r.y + nose.y * r.height
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < face.x || y < face.y ||
      x > face.x + face.width || y > face.y + face.height) return { reason: 'unmeasurable-face' }
    const regions = featureRegions(points)
    phase('loading')
    const { ort, session } = await faceOcc()
    phase('checking')
    const tensor = new ort.Tensor('float32', prepareFaceOcc(ctx.getImageData(0, 0, 256, 256).data, 256, 256), [1, 3, 256, 256])
    let outputs: Record<string, OrtTensor> | undefined
    const mask = new Uint8ClampedArray(256 * 256 * 4)
    try {
      outputs = await session.run({ image: tensor })
      const logits = outputs.logits
      if (!logits || logits.dims.join(',') !== '1,1,256,256' || logits.data.length * 4 !== mask.length) {
        throw new Error('Invalid FaceOcc output')
      }
      for (let i = 0; i < logits.data.length; i++) {
        if (!Number.isFinite(logits.data[i])) throw new Error('Invalid FaceOcc logit')
        mask[4 * i] = logits.data[i] >= 0 ? 255 : 0
      }
    } finally {
      tensor.dispose()
      if (outputs) for (const output of Object.values(outputs)) output.dispose()
    }
    const reason = checkFeatureVisibility(regions.map(region => measureRegion(region, mask, plan)))
    if (reason) return { reason }

    phase('preparing')
    const canvas = new OffscreenCanvas(1, 1)
    let maxEdge = 1400
    let blob: Blob
    do {
      const frame = frameFace(bitmap.width, bitmap.height, face, { ...CROP_C, maxEdge }).padded
      drawFrame(canvas, bitmap, frame, '#ffffff')
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
      if (blob.size <= 2 * 1024 * 1024 || maxEdge === 256) break
      maxEdge = Math.max(256, Math.floor(frame.output * 0.8))
    } while (true)
    const prepared = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}-centered.jpg`, { type: blob.type })
    return validPreparedPhoto(prepared) ? { file: prepared } : { reason: 'technical' }
  } finally { bitmap.close() }
}

scope.onmessage = async ({ data }) => {
  if (data.type === 'warmup') {
    // Initialize sequentially in the classic Worker: MediaPipe loaders share
    // the worker-global WASM factory. An actual inspection reports its failure.
    void detector().then(landmarks).then(faceOcc).catch(() => undefined)
    return
  }
  const { id, file } = data
  try {
    const result = await inspect(file, phase => scope.postMessage({ type: 'phase', id, phase }))
    scope.postMessage({ type: 'result', id, result })
  } catch {
    scope.postMessage({ type: 'result', id, result: { reason: 'technical' } })
  }
}
