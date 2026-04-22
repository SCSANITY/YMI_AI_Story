import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(projectRoot, 'public')

for (const envFile of ['.env.local', '.env.localhost']) {
  const envPath = path.join(projectRoot, envFile)
  if (!fs.existsSync(envPath)) continue
  const env = fs.readFileSync(envPath, 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    const value = match[2].trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

const args = new Set(process.argv.slice(2))
const isApply = args.has('--apply')
const isDryRun = args.has('--dry-run') || !isApply
const force = args.has('--force')
const publicOnly = args.has('--public-only')
const catalogOnly = args.has('--catalog-only')
const ids = process.argv
  .slice(2)
  .filter((item) => !item.startsWith('--'))
  .map((item) => item.trim())
  .filter(Boolean)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

const COVER_SIZE = Number(process.env.IMAGE_OPTIMIZE_COVER_SIZE || 1200)
const COVER_CONTENT_RATIO = Number(process.env.IMAGE_OPTIMIZE_COVER_CONTENT_RATIO || 0.92)
const ALPHA_THRESHOLD = Number(process.env.IMAGE_OPTIMIZE_ALPHA_THRESHOLD || 8)
const BOTTOM_MARGIN_RATIO = Number(process.env.IMAGE_OPTIMIZE_BOTTOM_MARGIN_RATIO || 0.035)
const COVER_QUALITY = Number(process.env.IMAGE_OPTIMIZE_COVER_WEBP_QUALITY || 82)
const SHOWCASE_MAX_WIDTH = Number(process.env.IMAGE_OPTIMIZE_SHOWCASE_MAX_WIDTH || 1600)
const SHOWCASE_QUALITY = Number(process.env.IMAGE_OPTIMIZE_SHOWCASE_WEBP_QUALITY || 84)
const BANNER_DESKTOP_WIDTH = Number(process.env.IMAGE_OPTIMIZE_BANNER_DESKTOP_WIDTH || 2400)
const BANNER_MOBILE_WIDTH = Number(process.env.IMAGE_OPTIMIZE_BANNER_MOBILE_WIDTH || 1100)
const BANNER_QUALITY = Number(process.env.IMAGE_OPTIMIZE_BANNER_WEBP_QUALITY || 84)
const SAMPLE_WIDTH = Number(process.env.IMAGE_OPTIMIZE_SAMPLE_WIDTH || 480)
const SAMPLE_QUALITY = Number(process.env.IMAGE_OPTIMIZE_SAMPLE_WEBP_QUALITY || 82)

const PUBLIC_BANNERS = [
  { input: 'banner-01.png', output: 'banner-01' },
  { input: 'banner-02.png', output: 'banner-02' },
  { input: 'Workflow.png', output: 'workflow' },
  { input: 'SwapFace.png', output: 'swapface' },
]

const PHOTO_SAMPLES = [
  'good-01.jpg',
  'good-02.jpg',
  'good-03.jpg',
  'bad-01.jpg',
  'bad-02.jpg',
  'bad-03.jpg',
]

function createSupabaseClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function logAction(message) {
  console.log(`${isDryRun ? '[dry-run]' : '[apply]'} ${message}`)
}

function ensureDir(dir) {
  if (isDryRun) return
  fs.mkdirSync(dir, { recursive: true })
}

function shouldSkipFile(filePath) {
  return !force && fs.existsSync(filePath)
}

async function optimizeToWebp(inputPath, outputPath, options) {
  if (shouldSkipFile(outputPath)) {
    logAction(`skip existing ${path.relative(projectRoot, outputPath)}`)
    return
  }

  logAction(`${path.relative(projectRoot, inputPath)} -> ${path.relative(projectRoot, outputPath)}`)
  if (isDryRun) return

  ensureDir(path.dirname(outputPath))
  await sharp(inputPath)
    .rotate()
    .resize({
      width: options.width,
      height: options.height,
      fit: options.fit || 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: options.quality,
      alphaQuality: options.alphaQuality ?? 90,
      effort: 5,
    })
    .toFile(outputPath)
}

async function optimizePublicAssets() {
  if (catalogOnly) return

  const bannerDir = path.join(publicRoot, 'banners')
  const optimizedBannerDir = path.join(bannerDir, 'optimized')
  for (const banner of PUBLIC_BANNERS) {
    const inputPath = path.join(bannerDir, banner.input)
    if (!fs.existsSync(inputPath)) {
      logAction(`skip missing ${path.relative(projectRoot, inputPath)}`)
      continue
    }

    await optimizeToWebp(inputPath, path.join(optimizedBannerDir, `${banner.output}-desktop.webp`), {
      width: BANNER_DESKTOP_WIDTH,
      quality: BANNER_QUALITY,
    })
    await optimizeToWebp(inputPath, path.join(optimizedBannerDir, `${banner.output}-mobile.webp`), {
      width: BANNER_MOBILE_WIDTH,
      quality: BANNER_QUALITY,
    })
  }

  const sampleDir = path.join(publicRoot, 'personalize-photo-samples')
  const optimizedSampleDir = path.join(sampleDir, 'optimized')
  for (const sample of PHOTO_SAMPLES) {
    const inputPath = path.join(sampleDir, sample)
    if (!fs.existsSync(inputPath)) {
      logAction(`skip missing ${path.relative(projectRoot, inputPath)}`)
      continue
    }

    await optimizeToWebp(inputPath, path.join(optimizedSampleDir, sample.replace(/\.[^.]+$/, '.webp')), {
      width: SAMPLE_WIDTH,
      quality: SAMPLE_QUALITY,
    })
  }
}

function templateStorageUrl(rawPath) {
  const value = String(rawPath || '').trim()
  if (!value || !SUPABASE_URL) return ''
  if (value.startsWith('http')) return value
  const cleaned = value.replace(/^app-templates\//, '').replace(/^\/+/, '')
  return `${SUPABASE_URL}/storage/v1/object/public/app-templates/${cleaned}`
}

function normalizeStoragePath(rawPath) {
  return String(rawPath || '').trim().replace(/^app-templates\//, '').replace(/^\/+/, '')
}

async function downloadBuffer(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function findAlphaBounds(buffer) {
  const image = sharp(buffer).ensureAlpha()
  const metadata = await image.metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0
  if (!width || !height) throw new Error('Image has no dimensions')

  const raw = await image.raw().toBuffer()
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[(y * width + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) throw new Error('Image has no visible pixels')
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

async function normalizeCover(buffer) {
  const bounds = await findAlphaBounds(buffer)
  const targetContentSize = Math.round(COVER_SIZE * COVER_CONTENT_RATIO)
  const extractedBuffer = await sharp(buffer)
    .ensureAlpha()
    .extract(bounds)
    .resize({
      width: targetContentSize,
      height: targetContentSize,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()

  const extractedMetadata = await sharp(extractedBuffer).metadata()
  const resizedWidth = extractedMetadata.width || targetContentSize
  const resizedHeight = extractedMetadata.height || targetContentSize
  const left = Math.round((COVER_SIZE - resizedWidth) / 2)
  const bottomMargin = Math.round(COVER_SIZE * BOTTOM_MARGIN_RATIO)
  const top = Math.max(0, Math.min(Math.round((COVER_SIZE - resizedHeight) / 2), COVER_SIZE - resizedHeight - bottomMargin))

  return sharp({
    create: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: extractedBuffer, left, top }])
    .webp({
      quality: COVER_QUALITY,
      alphaQuality: 90,
      effort: 5,
    })
    .toBuffer()
}

async function optimizeShowcase(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({
      width: SHOWCASE_MAX_WIDTH,
      height: SHOWCASE_MAX_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: SHOWCASE_QUALITY,
      alphaQuality: 90,
      effort: 5,
    })
    .toBuffer()
}

async function uploadStorageObject(supabase, storagePath, buffer) {
  if (isDryRun) return
  const { error } = await supabase.storage
    .from('app-templates')
    .upload(storagePath, buffer, {
      contentType: 'image/webp',
      upsert: true,
    })
  if (error) throw error
}

async function optimizeCatalogAssets() {
  if (publicOnly) return

  const supabase = createSupabaseClient()
  if (!supabase) {
    logAction('skip catalog assets because NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
    return
  }

  let query = supabase
    .from('templates')
    .select('template_id, cover_image_path, normalized_cover_image_path, showcase_image_paths')
    .eq('is_active', true)

  if (ids.length) query = query.in('template_id', ids)

  const { data, error } = await query
  if (error) throw error

  for (const row of data || []) {
    const templateId = String(row.template_id || '').trim()
    if (!templateId) continue

    const updates = {}
    const coverUrl = templateStorageUrl(row.cover_image_path)
    const normalizedPath = `app-templates/${templateId}/cover-normalized.webp`
    if (coverUrl && (force || row.normalized_cover_image_path !== normalizedPath)) {
      logAction(`[cover] ${templateId} -> ${normalizedPath}`)
      if (isDryRun) {
        updates.normalized_cover_image_path = normalizedPath
      } else {
        const coverBuffer = await downloadBuffer(coverUrl)
        const normalizedBuffer = await normalizeCover(coverBuffer)
        await uploadStorageObject(supabase, `${templateId}/cover-normalized.webp`, normalizedBuffer)
        updates.normalized_cover_image_path = normalizedPath
      }
    } else {
      logAction(`[cover] skip ${templateId}`)
    }

    const showcasePaths = Array.isArray(row.showcase_image_paths)
      ? row.showcase_image_paths.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const optimizedShowcasePaths = []

    for (let index = 0; index < showcasePaths.length; index += 1) {
      const sourcePath = showcasePaths[index]
      if (sourcePath.includes('/optimized/') && /\.webp($|\?)/i.test(sourcePath)) {
        optimizedShowcasePaths.push(sourcePath)
        continue
      }

      const sourceUrl = templateStorageUrl(sourcePath)
      if (!sourceUrl) continue

      const targetPath = `app-templates/${templateId}/optimized/showcase-${String(index + 1).padStart(2, '0')}.webp`
      optimizedShowcasePaths.push(targetPath)
      logAction(`[showcase] ${templateId} ${sourcePath} -> ${targetPath}`)
      if (isDryRun) continue
      const sourceBuffer = await downloadBuffer(sourceUrl)
      const optimizedBuffer = await optimizeShowcase(sourceBuffer)
      await uploadStorageObject(supabase, normalizeStoragePath(targetPath), optimizedBuffer)
    }

    if (optimizedShowcasePaths.length && JSON.stringify(optimizedShowcasePaths) !== JSON.stringify(showcasePaths)) {
      updates.showcase_image_paths = optimizedShowcasePaths
    }

    if (Object.keys(updates).length) {
      if (!isDryRun) {
        const { error: updateError } = await supabase
          .from('templates')
          .update(updates)
          .eq('template_id', templateId)
        if (updateError) throw updateError
      }
      logAction(`[db] ${templateId} update ${Object.keys(updates).join(', ')}`)
    }
  }
}

async function main() {
  console.log(isDryRun ? 'Image optimization dry run' : 'Image optimization apply')
  if (force) console.log('Force mode enabled')

  await optimizePublicAssets()
  await optimizeCatalogAssets()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
