import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const OUTPUT_SIZE = Number(process.env.COVER_NORMALIZE_SIZE || 1400)
const TARGET_CONTENT_RATIO = Number(process.env.COVER_NORMALIZE_CONTENT_RATIO || 0.92)
const ALPHA_THRESHOLD = Number(process.env.COVER_NORMALIZE_ALPHA_THRESHOLD || 8)
const BOTTOM_MARGIN_RATIO = Number(process.env.COVER_NORMALIZE_BOTTOM_MARGIN_RATIO || 0.035)
const WEBP_QUALITY = Number(process.env.COVER_NORMALIZE_WEBP_QUALITY || 84)
const WEBP_ALPHA_QUALITY = Number(process.env.COVER_NORMALIZE_WEBP_ALPHA_QUALITY || 90)

function templateStorageUrl(rawPath) {
  const value = String(rawPath || '').trim()
  if (!value) return ''
  if (value.startsWith('http')) return value
  const cleaned = value.replace(/^app-templates\//, '').replace(/^\/+/, '')
  return `${SUPABASE_URL}/storage/v1/object/public/app-templates/${cleaned}`
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
  if (!width || !height) throw new Error('Cover image has no dimensions')

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

  if (maxX < 0 || maxY < 0) {
    throw new Error('Cover image has no visible pixels')
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

async function normalizeCover(buffer) {
  const bounds = await findAlphaBounds(buffer)
  const targetContentSize = Math.round(OUTPUT_SIZE * TARGET_CONTENT_RATIO)
  const extracted = sharp(buffer)
    .ensureAlpha()
    .extract(bounds)
    .resize({
      width: targetContentSize,
      height: targetContentSize,
      fit: 'inside',
      withoutEnlargement: false,
    })

  const extractedBuffer = await extracted.png().toBuffer()
  const extractedMetadata = await sharp(extractedBuffer).metadata()
  const resizedWidth = extractedMetadata.width || targetContentSize
  const resizedHeight = extractedMetadata.height || targetContentSize
  const left = Math.round((OUTPUT_SIZE - resizedWidth) / 2)
  const bottomMargin = Math.round(OUTPUT_SIZE * BOTTOM_MARGIN_RATIO)
  const top = Math.max(0, Math.min(Math.round((OUTPUT_SIZE - resizedHeight) / 2), OUTPUT_SIZE - resizedHeight - bottomMargin))

  return sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: extractedBuffer, left, top }])
    .webp({
      quality: WEBP_QUALITY,
      alphaQuality: WEBP_ALPHA_QUALITY,
      effort: 5,
    })
    .toBuffer()
}

async function main() {
  const ids = process.argv.slice(2).map((item) => item.trim()).filter(Boolean)

  let query = supabase
    .from('templates')
    .select('template_id, cover_image_path')
    .eq('is_active', true)

  if (ids.length) {
    query = query.in('template_id', ids)
  }

  const { data, error } = await query
  if (error) throw error

  for (const row of data || []) {
    const templateId = row.template_id
    const sourceUrl = templateStorageUrl(row.cover_image_path)
    if (!templateId || !sourceUrl) {
      console.log(`[skip] ${templateId || 'unknown'} has no cover_image_path`)
      continue
    }

    console.log(`[cover] normalizing ${templateId}`)
    const sourceBuffer = await downloadBuffer(sourceUrl)
    const normalizedBuffer = await normalizeCover(sourceBuffer)
    const storagePath = `${templateId}/cover-normalized.webp`

    const { error: uploadError } = await supabase.storage
      .from('app-templates')
      .upload(storagePath, normalizedBuffer, {
        contentType: 'image/webp',
        upsert: true,
      })

    if (uploadError) throw uploadError

    const normalizedPath = `app-templates/${storagePath}`
    const { error: updateError } = await supabase
      .from('templates')
      .update({ normalized_cover_image_path: normalizedPath })
      .eq('template_id', templateId)

    if (updateError) throw updateError
    console.log(`[cover] ${templateId} -> ${normalizedPath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
