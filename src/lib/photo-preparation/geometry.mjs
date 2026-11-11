const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export function frameFace(width, height, face, options = {}) {
  const { sideMargin = 0.8, topMargin = 0.8, bottomMargin = 1.25, maxEdge = 1400 } = options
  const values = [width, height, face.x, face.y, face.width, face.height, sideMargin, topMargin, bottomMargin, maxEdge]
  if (!values.every(Number.isFinite) || width <= 0 || height <= 0 || face.width <= 0 || face.height <= 0 ||
      [sideMargin, topMargin, bottomMargin].some(n => n < 0 || n > 2) || maxEdge < 256 || maxEdge > 2048) {
    throw new Error('Invalid framing geometry')
  }
  if (face.x >= width || face.y >= height || face.x + face.width <= 0 || face.y + face.height <= 0) {
    throw new Error('The selected face does not intersect this image')
  }
  const desiredWidth = face.width * (1 + sideMargin * 2)
  const desiredHeight = face.height * (1 + topMargin + bottomMargin)
  const side = Math.max(desiredWidth, desiredHeight)
  const cx = face.x + face.width / 2
  const cy = face.y + face.height * (1 + bottomMargin - topMargin) / 2
  const sourceClipped = face.x < 0 || face.y < 0 || face.x + face.width > width || face.y + face.height > height

  function plan(x, y, size) {
    const sx = Math.max(0, x), sy = Math.max(0, y)
    const sw = Math.max(0, Math.min(width, x + size) - sx)
    const sh = Math.max(0, Math.min(height, y + size) - sy)
    const output = Math.max(1, Math.floor(Math.min(size, maxEdge)))
    const scale = output / size
    return {
      crop: { x, y, size }, source: { x: sx, y: sy, width: sw, height: sh },
      destination: { x: (sx - x) * scale, y: (sy - y) * scale, width: sw * scale, height: sh * scale },
      output, scale, padding: clamp(1 - (sw * sh) / (size * size), 0, 1), sourceClipped,
      includesVisibleFace: Math.max(0, face.x) >= x && Math.max(0, face.y) >= y &&
        Math.min(width, face.x + face.width) <= x + size && Math.min(height, face.y + face.height) <= y + size,
    }
  }
  const boundedSide = Math.min(side, width, height)
  return {
    inside: plan(clamp(cx - boundedSide / 2, 0, width - boundedSide), clamp(cy - boundedSide / 2, 0, height - boundedSide), boundedSide),
    padded: plan(cx - side / 2, cy - side / 2, side),
  }
}

export function drawFrame(canvas, image, plan, background) {
  canvas.width = plan.output
  canvas.height = plan.output
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const s = plan.source, d = plan.destination
  ctx.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height)
}
