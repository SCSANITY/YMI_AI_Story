/**
 * One-off: optimize raw email design assets (from Downloads) into
 * public/email-assets/ with stable names.
 *
 * The source art (ChatGPT-generated) has a FAKE transparency checkerboard
 * baked into the pixels. removeChecker() flood-fills from the image borders,
 * erasing connected neutral (white/gray checker) pixels to real alpha while
 * leaving interior whites (sweaters, card faces) untouched.
 *
 * Usage: node scripts/prepare-email-assets.mjs
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'email-assets')
const DL = 'C:/Users/user/Downloads'
const PUBLIC = join(__dirname, '..', 'public')

// width = 2x the intended display width (retina); desktop layout is 920px wide.
// Dividers and small ornaments are drawn in code now — only artwork ships as images.
const SOURCES = [
  // Wide landscape banner (kids at edges, open sky center) — fits the 920px format
  { src: `${DL}/ChatGPT Image 2026年6月11日 18_59_25.png`, out: 'banner.png', width: 1840, dechecker: true },
  { src: `${DL}/ChatGPT Image 2026年6月11日 18_26_07.png`, out: 'sparkles.png', width: 320, dechecker: true },
  // Hand-stamped wax-seal feel: tilt baked into pixels (CSS transform is stripped by Gmail).
  // Source = official "WITH WARMTH AND STARLIGHT" round seal (Ver3.0).
  { src: 'D:/IT_David/AI 有声图书/Logo/chapter/Ver3.0.png', out: 'seal.png', width: 300, dechecker: true, globalChecker: true, rotate: -9 },
  { src: `${DL}/ChatGPT Image 2026年6月11日 18_25_57.png`, out: 'texture.jpg', width: 1600, jpeg: true },
  { src: `${DL}/ChatGPT Image 2026年6月11日 18_24_37.png`, out: 'cover-placeholder.png', width: 520, dechecker: true, globalChecker: true },
  // Official site logo — full lockup (M-book icon + YMI STORY text), trimmed tight
  { src: join(PUBLIC, 'logo.png'), out: 'logo-full.png', width: 300, trim: true },
]

const TOL = 16 // per-channel tolerance when matching checker colors
const NEUTRAL = 18 // max |r-g|,|g-b| spread for a pixel to count as neutral gray/white

/**
 * Erase the fake checkerboard: BFS from borders through neutral checker-colored pixels.
 * `global` mode additionally erases ALL pixels matching the checker tones — needed when
 * a closed shape (seal ring, frame) traps checker inside where flood fill can't reach.
 * Only safe for images whose content has no large genuine white areas.
 */
async function removeChecker(srcPath, global = false) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info

  const isNeutral = (i) =>
    Math.abs(data[i] - data[i + 1]) <= NEUTRAL && Math.abs(data[i + 1] - data[i + 2]) <= NEUTRAL

  // The checker uses two neutral tones (≈white + light gray). Find them from
  // the border pixels' brightness histogram (16-level buckets).
  const buckets = new Map()
  const border = []
  for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1])
  for (let y = 1; y < h - 1; y++) border.push([0, y], [w - 1, y])
  for (const [x, y] of border) {
    const i = (y * w + x) * 4
    if (!isNeutral(i)) continue
    const b = Math.round(data[i] / 16) * 16
    buckets.set(b, (buckets.get(b) || 0) + 1)
  }
  const tones = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t)
  if (tones.length === 0) return sharp(srcPath) // nothing to do

  const matches = (i) => isNeutral(i) && tones.some((t) => Math.abs(data[i] - t) <= TOL + 8)

  const visited = new Uint8Array(w * h)
  const queue = []
  for (const [x, y] of border) {
    const p = y * w + x
    if (!visited[p] && matches(p * 4)) {
      visited[p] = 1
      queue.push(p)
    }
  }
  while (queue.length) {
    const p = queue.pop()
    data[p * 4 + 3] = 0
    const x = p % w
    const y = (p / w) | 0
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const np = ny * w + nx
      if (!visited[np] && matches(np * 4)) {
        visited[np] = 1
        queue.push(np)
      }
    }
  }

  if (global) {
    for (let p = 0; p < w * h; p++) {
      if (data[p * 4 + 3] !== 0 && matches(p * 4)) data[p * 4 + 3] = 0
    }
  }

  // Soften the cut edge: any remaining pixel adjacent to erased area gets 55% alpha
  // if it is still near-neutral (kills the light halo without eating content).
  const erased = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] === 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] === 0 || !isNeutral(i) || data[i] < 180) continue
      if (erased(x - 1, y) || erased(x + 1, y) || erased(x, y - 1) || erased(x, y + 1)) {
        data[i + 3] = 140
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
}

// ── Social icons — generated from inline SVG (no downloads needed) ──────────
// Color matches the footer text (emailTheme.heading). Display size 32px (64 = 2x retina).
const ICON_COLOR = '#9a5b10'
const SOCIAL_ICONS = {
  'icon-instagram.png': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="${ICON_COLOR}" stroke-width="2"/>
      <rect x="14" y="14" width="20" height="20" rx="5.5" fill="none" stroke="${ICON_COLOR}" stroke-width="2.4"/>
      <circle cx="24" cy="24" r="4.6" fill="none" stroke="${ICON_COLOR}" stroke-width="2.4"/>
      <circle cx="29.8" cy="18.2" r="1.7" fill="${ICON_COLOR}"/>
    </svg>`,
  'icon-facebook.png': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="${ICON_COLOR}" stroke-width="2"/>
      <path fill="${ICON_COLOR}" d="M26.6 36V25.5h3.5l.53-4.1h-4.03v-2.61c0-1.18.33-1.99 2.02-1.99h2.15V13.1c-.37-.05-1.65-.16-3.13-.16-3.1 0-5.22 1.89-5.22 5.36v2.99H19v4.1h3.42V36h4.18z"/>
    </svg>`,
  'icon-tiktok.png': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="${ICON_COLOR}" stroke-width="2"/>
      <path fill="${ICON_COLOR}" d="M33.5 20.2a8.6 8.6 0 0 1-5.03-1.61v7.91a6.66 6.66 0 1 1-6.66-6.6c.23 0 .46.01.68.04v3.68a3 3 0 1 0 2.3 2.92V12.5h3.6c.03.31.09.62.17.91a5 5 0 0 0 2.21 2.94c.8.5 1.74.79 2.73.79v3.06z"/>
    </svg>`,
}

mkdirSync(OUT_DIR, { recursive: true })

for (const [out, svg] of Object.entries(SOCIAL_ICONS)) {
  await sharp(Buffer.from(svg)).resize({ width: 64 }).png().toFile(join(OUT_DIR, out))
  console.log(`  ${out}  (generated from SVG)`)
}

for (const { src, out, width, jpeg, dechecker, globalChecker, rotate, topCrop, trim } of SOURCES) {
  const outPath = join(OUT_DIR, out)
  // Raw sources (from Downloads) get cleared over time. If a source is gone, keep the
  // already-built asset rather than failing the whole run.
  if (!existsSync(src)) {
    console.log(`  ${out}  (skipped — source missing, keeping existing)`)
    continue
  }
  let pipe = dechecker ? await removeChecker(src, globalChecker) : sharp(src)
  if (trim) {
    pipe = sharp(await pipe.trim().png().toBuffer())
  }
  if (topCrop) {
    // Keep only the top portion (icon), then trim transparent margins tight
    const trimmed = await sharp(await pipe.png().toBuffer()).trim().png().toBuffer()
    const meta = await sharp(trimmed).metadata()
    const cropped = await sharp(trimmed)
      .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * topCrop) })
      .trim()
      .png()
      .toBuffer()
    pipe = sharp(cropped)
  }
  if (rotate) {
    // rotate() must run on its own pass — chaining resize on the same pipeline
    // applies operations in a different order than declared
    const buf = await pipe.png().toBuffer()
    pipe = sharp(buf).rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  }
  pipe = pipe.resize({ width, withoutEnlargement: true })
  if (jpeg) {
    pipe = pipe.flatten({ background: '#fdf6e7' }).jpeg({ quality: 72 })
  } else {
    pipe = pipe.png({ palette: true, quality: 80, compressionLevel: 9 })
  }
  await pipe.toFile(outPath)
  const kb = Math.round(statSync(outPath).size / 1024)
  const meta = await sharp(outPath).metadata()
  console.log(`  ${out}  ${kb} KB  alpha:${meta.hasAlpha}`)
}
console.log('\nDone → public/email-assets/')
