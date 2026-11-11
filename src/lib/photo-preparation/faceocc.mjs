import { frameFace } from './geometry.mjs'

export function faceOccPlan(width, height, face) {
  // Fixed BEFORE replay. Approximate bbox framing, not landmark-aligned FFHQ.
  const p = frameFace(width, height, face, { sideMargin: .25, topMargin: .35, bottomMargin: .15, maxEdge: 256 }).inside
  return { source: p.source, input: { width: 256, height: 256 }, original: { width, height }, padding: 0, visibleFaceIncluded: p.includesVisibleFace, sourceFaceClipped: p.sourceClipped, method: 'bbox-square-1.5-v1-not-landmark-aligned' }
}

export function prepareFaceOcc(pixels, width, height) {
  if (width !== 256 || height !== 256 || pixels.length !== width * height * 4) throw new Error('Invalid FaceOcc input')
  const n = width * height, output = new Float32Array(n * 3)
  const mean = [.485, .456, .406], std = [.229, .224, .225]
  for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) output[c * n + i] = (pixels[4 * i + c] / 255 - mean[c]) / std[c]
  return output
}
