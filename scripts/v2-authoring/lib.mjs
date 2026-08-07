import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { tsImport } from 'tsx/esm/api'

const MIN_EDGE = 512
const SQUARE_TOLERANCE = 0.02
const AUTHORING_IMAGE_PATTERN = /\.(?:png|webp)$/i
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export class V2AuthoringError extends Error {
  constructor(issues) {
    super(`V2 authoring package is invalid:\n- ${issues.join('\n- ')}`)
    this.name = 'V2AuthoringError'
    this.issues = issues
  }
}

function normalizeRelativePath(value) {
  const normalized = String(value).trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new V2AuthoringError([`Path must be relative: ${value}`])
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new V2AuthoringError([`Path must not contain traversal or empty segments: ${value}`])
  }
  return normalized
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function isNearlySquare(width, height) {
  return Math.abs(width - height) / Math.max(width, height) <= SQUARE_TOLERANCE
}

function parseAssetPath(rawPath) {
  const assetPath = normalizeRelativePath(rawPath)
  let match = assetPath.match(/^preview0_([AB])\.webp$/i)
  if (match) {
    return {
      assetPath,
      templateImage: path.posix.basename(assetPath),
      format: 'webp',
      marker: match[1].toUpperCase(),
      role: 'preview_cover',
      spreadIndex: 0,
      side: null,
      pageNumber: null,
      scope: 'preview',
    }
  }

  match = assetPath.match(/^preview(\d+)_([LR])_([AB])\.webp$/i)
  if (match && Number(match[1]) >= 1) {
    const spreadIndex = Number(match[1])
    const side = match[2].toUpperCase() === 'L' ? 'left' : 'right'
    return {
      assetPath,
      templateImage: path.posix.basename(assetPath),
      format: 'webp',
      marker: match[3].toUpperCase(),
      role: 'preview_interior',
      spreadIndex,
      side,
      pageNumber: spreadIndex * 2 - (side === 'left' ? 1 : 0),
      scope: 'preview',
    }
  }

  match = assetPath.match(/^final\/page0_([LR])_([AB])\.png$/i)
  if (match) {
    const side = match[1].toUpperCase() === 'L' ? 'left' : 'right'
    return {
      assetPath,
      templateImage: path.posix.basename(assetPath),
      format: 'png',
      marker: match[2].toUpperCase(),
      role: side === 'left' ? 'final_back_cover' : 'final_front_cover',
      spreadIndex: 0,
      side,
      pageNumber: null,
      scope: 'final',
    }
  }

  match = assetPath.match(/^final\/page(\d+)_([LR])_([AB])\.png$/i)
  if (match && Number(match[1]) >= 1) {
    const spreadIndex = Number(match[1])
    const side = match[2].toUpperCase() === 'L' ? 'left' : 'right'
    return {
      assetPath,
      templateImage: path.posix.basename(assetPath),
      format: 'png',
      marker: match[3].toUpperCase(),
      role: 'final_interior',
      spreadIndex,
      side,
      pageNumber: spreadIndex * 2 - (side === 'left' ? 1 : 0),
      scope: 'final',
    }
  }

  return null
}

async function walkFiles(root, current = '') {
  const absolute = path.join(root, current)
  const entries = await fs.readdir(absolute, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = current ? path.posix.join(current.replace(/\\/g, '/'), entry.name) : entry.name
    if (entry.isDirectory()) files.push(...await walkFiles(root, relative))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

export async function inventoryLocalAssets(assetsDir) {
  const files = await walkFiles(assetsDir)
  const imageFiles = files.filter((file) => AUTHORING_IMAGE_PATTERN.test(file))
  const inventory = []
  const issues = []

  for (const relativePath of imageFiles) {
    const parsed = parseAssetPath(relativePath)
    if (!parsed) {
      issues.push(`Unrecognized authoring image path ${relativePath}`)
      continue
    }
    const absolutePath = path.join(assetsDir, ...relativePath.split('/'))
    const buffer = await fs.readFile(absolutePath)
    let metadata
    try {
      metadata = await sharp(buffer).metadata()
    } catch {
      issues.push(`Unreadable image ${relativePath}`)
      continue
    }
    inventory.push({
      path: parsed.assetPath,
      format: String(metadata.format || '').toLowerCase(),
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      size: buffer.byteLength,
      sha256: sha256(buffer),
    })
  }

  if (issues.length) throw new V2AuthoringError(issues)
  return inventory
}

export async function readInventoryFile(inventoryPath) {
  const raw = JSON.parse(await fs.readFile(inventoryPath, 'utf8'))
  const assets = Array.isArray(raw) ? raw : raw?.assets
  if (!Array.isArray(assets)) {
    throw new V2AuthoringError(['Inventory JSON must be an array or contain an assets array'])
  }
  return assets
}

function sortParsedAssets(left, right) {
  const scopeOrder = left.scope === right.scope ? 0 : left.scope === 'preview' ? -1 : 1
  if (scopeOrder) return scopeOrder
  if (left.spreadIndex !== right.spreadIndex) return left.spreadIndex - right.spreadIndex
  if (left.role === 'preview_cover') return -1
  if (right.role === 'preview_cover') return 1
  if (left.side === right.side) return 0
  return left.side === 'left' ? -1 : 1
}

function validatePairing(pages, role, issues) {
  const matching = pages.filter((page) => page.role === role)
  const spreads = new Map()
  for (const page of matching) {
    const group = spreads.get(page.spreadIndex) ?? []
    group.push(page)
    spreads.set(page.spreadIndex, group)
  }
  const indexes = [...spreads.keys()].sort((a, b) => a - b)
  indexes.forEach((spreadIndex, position) => {
    if (spreadIndex !== position + 1) {
      issues.push(`${role} spread indexes must be contiguous from 1; found ${spreadIndex} at position ${position + 1}`)
    }
    const group = spreads.get(spreadIndex) ?? []
    if (group.length !== 2 || !group.some((page) => page.side === 'left') || !group.some((page) => page.side === 'right')) {
      issues.push(`${role} spread ${spreadIndex} must contain exactly one left and one right image`)
    }
  })
  if (!indexes.length) issues.push(`${role} must contain at least one complete spread`)
}

export function deriveAuthoredPages(rawInventory) {
  const issues = []
  const seenPaths = new Set()
  const parsedPages = []

  for (const [position, raw] of rawInventory.entries()) {
    if (!isRecord(raw)) {
      issues.push(`Inventory item ${position + 1} must be an object`)
      continue
    }
    let parsed
    try {
      parsed = parseAssetPath(raw.path)
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error))
      continue
    }
    if (!parsed) {
      issues.push(`Unrecognized authoring image path ${raw.path}`)
      continue
    }
    const key = parsed.assetPath.toLowerCase()
    if (seenPaths.has(key)) {
      issues.push(`Duplicate asset path ${parsed.assetPath}`)
      continue
    }
    seenPaths.add(key)

    const width = Number(raw.width)
    const height = Number(raw.height)
    const format = String(raw.format || '').toLowerCase()
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_EDGE || height < MIN_EDGE) {
      issues.push(`${parsed.assetPath} must be at least ${MIN_EDGE}px on each edge`)
    } else if (!isNearlySquare(width, height)) {
      issues.push(`${parsed.assetPath} must be square within ${SQUARE_TOLERANCE * 100}%`)
    }
    if (format !== parsed.format) {
      issues.push(`${parsed.assetPath} bytes must be ${parsed.format}, received ${format || 'unknown'}`)
    }

    parsedPages.push({
      ...parsed,
      width,
      height,
      size: Number(raw.size) || null,
      sha256: typeof raw.sha256 === 'string' ? raw.sha256 : null,
      enableFaceSwap: parsed.marker === 'A',
    })
  }

  const previewCovers = parsedPages.filter((page) => page.role === 'preview_cover')
  const backCovers = parsedPages.filter((page) => page.role === 'final_back_cover')
  const frontCovers = parsedPages.filter((page) => page.role === 'final_front_cover')
  if (previewCovers.length !== 1) issues.push('Exactly one preview0_A.webp cover is required')
  if (previewCovers[0]?.marker !== 'A') issues.push('Preview cover must use the _A face-swap authoring marker')
  if (backCovers.length !== 1 || backCovers[0]?.marker !== 'B') {
    issues.push('Final back cover must be exactly final/page0_L_B.png')
  }
  if (frontCovers.length !== 1 || frontCovers[0]?.marker !== 'A') {
    issues.push('Final front cover must be exactly final/page0_R_A.png')
  }
  validatePairing(parsedPages, 'preview_interior', issues)
  validatePairing(parsedPages, 'final_interior', issues)

  if (issues.length) throw new V2AuthoringError(issues)
  return parsedPages.sort(sortParsedAssets)
}

function getSourcePages(config, scope) {
  const indices = config?.[scope]?.page_indices
  if (!Array.isArray(config?.pages) || !Array.isArray(indices)) return []
  const byIndex = new Map(config.pages.map((page) => [page?.index, page]))
  return indices.map((index) => byIndex.get(index)).filter(Boolean)
}

function findWorkflowOverrides(sourceConfig, page) {
  if (!page.enableFaceSwap) return null
  const exact = sourceConfig.pages?.find((candidate) => candidate?.template_image === page.templateImage)
  if (isRecord(exact?.workflow_overrides)) return clone(exact.workflow_overrides)

  const previewPages = getSourcePages(sourceConfig, 'preview')
  if (page.role === 'preview_cover') {
    const cover = previewPages[0]
    return isRecord(cover?.workflow_overrides) ? clone(cover.workflow_overrides) : null
  }
  if (page.role === 'final_front_cover') {
    const overrides = previewPages[0]?.workflow_overrides
    if (!isRecord(overrides)) return null
    if (isRecord(overrides.final_face)) return { final_face: clone(overrides.final_face) }
    if (isRecord(overrides.preview_face)) return { final_face: clone(overrides.preview_face) }
    return null
  }
  if (page.role === 'preview_interior') {
    const interior = previewPages.slice(1).find((candidate) => isRecord(candidate?.workflow_overrides))
    return interior ? clone(interior.workflow_overrides) : null
  }
  if (page.role === 'final_interior') {
    const sourcePage = getSourcePages(sourceConfig, 'final')[page.spreadIndex - 1]
    const finalFace = sourcePage?.workflow_overrides?.final_face
    return isRecord(finalFace) ? { final_face: clone(finalFace) } : null
  }
  return null
}

export function buildV2Config(sourceConfig, authoredPages) {
  if (!isRecord(sourceConfig)) throw new V2AuthoringError(['Source config must be an object'])
  if (!sourceConfig.template_id || !sourceConfig.base_path) {
    throw new V2AuthoringError(['Source config must define template_id and base_path'])
  }
  if (!sourceConfig.subtitle_render?.enabled || !sourceConfig.subtitle_render?.template_path) {
    throw new V2AuthoringError(['Source config must enable subtitle_render and define template_path'])
  }

  const preserved = clone(sourceConfig)
  delete preserved.schema_version
  delete preserved.asset_layout
  delete preserved.pages
  delete preserved.preview
  delete preserved.final

  const pages = authoredPages.map((page, index) => {
    const result = {
      index,
      template_image: page.templateImage,
      enable_face_swap: page.enableFaceSwap,
      presentation: {
        role: page.role,
        spread_index: page.spreadIndex,
        ...(page.side ? { side: page.side } : {}),
        ...(page.pageNumber ? { page_number: page.pageNumber } : {}),
      },
    }
    const workflowOverrides = findWorkflowOverrides(sourceConfig, page)
    if (workflowOverrides) result.workflow_overrides = workflowOverrides
    return result
  })

  const previewIndices = pages.filter((page) => page.presentation.role.startsWith('preview_')).map((page) => page.index)
  const finalIndices = pages.filter((page) => page.presentation.role.startsWith('final_')).map((page) => page.index)

  return {
    schema_version: 2,
    asset_layout: 'single-page',
    ...preserved,
    pages,
    preview: { page_indices: previewIndices },
    final: { page_indices: finalIndices },
  }
}

export function collectSubtitleTemplatePaths(config) {
  const paths = []
  const add = (value) => {
    if (typeof value !== 'string' || !value.trim()) return
    const normalized = normalizeRelativePath(value)
    if (!paths.includes(normalized)) paths.push(normalized)
  }
  add(config?.subtitle_render?.template_path)
  for (const variant of config?.subtitle_render?.template_variants ?? []) add(variant?.template_path)
  return paths
}

export function validateSubtitleDocument({ document, templatePath, authoredPages, placeholderKeys = [] }) {
  const issues = []
  if (!isRecord(document) || !Array.isArray(document.pages)) {
    throw new V2AuthoringError([`${templatePath} must contain a pages array`])
  }
  const expected = new Map(authoredPages.map((page) => [page.templateImage, page]))
  const seen = new Set()
  const allowedPlaceholders = new Set(placeholderKeys.map(String))

  document.pages.forEach((page, position) => {
    if (!isRecord(page) || typeof page.image !== 'string' || !page.image.trim()) {
      issues.push(`${templatePath} pages[${position}] must define image`)
      return
    }
    const image = page.image.trim()
    if (seen.has(image)) issues.push(`${templatePath} has duplicate subtitle entry ${image}`)
    seen.add(image)
    const asset = expected.get(image)
    if (!asset) issues.push(`${templatePath} has orphan subtitle entry ${image}`)
    if (!Array.isArray(page.texts)) {
      issues.push(`${templatePath} entry ${image} must define texts as an array`)
      return
    }
    if (asset && (page.width !== asset.width || page.height !== asset.height)) {
      issues.push(`${templatePath} entry ${image} dimensions must match the asset (${asset.width}x${asset.height})`)
    }
    for (const text of page.texts) {
      if (!isRecord(text) || typeof text.content !== 'string') {
        issues.push(`${templatePath} entry ${image} contains text without string content`)
        continue
      }
      for (const match of text.content.matchAll(/\{([^{}]+)\}/g)) {
        if (!allowedPlaceholders.has(match[1])) {
          issues.push(`${templatePath} entry ${image} uses undeclared placeholder {${match[1]}}`)
        }
      }
    }
  })

  for (const image of expected.keys()) {
    if (!seen.has(image)) issues.push(`${templatePath} is missing subtitle entry ${image}`)
  }
  if (issues.length) throw new V2AuthoringError(issues)
}

async function validateWithWorkerContract({ config, subtitleDocuments, authoredPages }) {
  const workerRoot = process.env.YMI_WORKER_ROOT
    ? path.resolve(process.env.YMI_WORKER_ROOT)
    : path.resolve(PROJECT_ROOT, '..', 'worker')
  const contractPath = path.join(workerRoot, 'bookPageContract.ts')
  try {
    await fs.access(contractPath)
  } catch {
    throw new V2AuthoringError([`Active Worker contract not found: ${contractPath}`])
  }

  const workerContract = await tsImport(pathToFileURL(contractPath).href, import.meta.url)
  if (typeof workerContract.validateSinglePageTemplateContract !== 'function') {
    throw new V2AuthoringError([`Active Worker contract does not export validateSinglePageTemplateContract`])
  }
  const availableStorageFiles = authoredPages.map((page) => page.assetPath)
  const results = []
  for (const subtitle of subtitleDocuments) {
    try {
      const validated = workerContract.validateSinglePageTemplateContract({
        config,
        subtitleTemplate: subtitle.document,
        availableStorageFiles,
      })
      results.push({
        template_path: subtitle.path,
        preview_pages: validated.preview.length,
        final_pages: validated.final.length,
      })
    } catch (error) {
      const message = Array.isArray(error?.issues) ? error.issues.join('; ') : error instanceof Error ? error.message : String(error)
      throw new V2AuthoringError([`Active Worker rejected ${subtitle.path}: ${message}`])
    }
  }
  return results
}

function validateAgeVariants(config) {
  const variants = config?.subtitle_render?.template_variants
  if (!Array.isArray(variants)) return
  const issues = []
  const ranges = []
  const ids = new Set()
  for (const [index, variant] of variants.entries()) {
    const id = String(variant?.id || '').trim()
    if (!id) issues.push(`subtitle_render.template_variants[${index}] must define id`)
    else if (ids.has(id)) issues.push(`Duplicate subtitle variant id ${id}`)
    else ids.add(id)
    const min = variant?.when?.child_age_min ?? Number.NEGATIVE_INFINITY
    const max = variant?.when?.child_age_max ?? Number.POSITIVE_INFINITY
    if (typeof min !== 'number' || typeof max !== 'number' || min > max) {
      issues.push(`Subtitle variant ${id || index} has an invalid child age range`)
      continue
    }
    ranges.push({ id: id || String(index), min, max })
  }
  ranges.sort((a, b) => a.min - b.min)
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].min <= ranges[index - 1].max) {
      issues.push(`Subtitle variants ${ranges[index - 1].id} and ${ranges[index].id} overlap`)
    }
  }
  if (issues.length) throw new V2AuthoringError(issues)
}

export async function buildAuthoringPackage({ storyDir, rawInventory }) {
  const sourceConfigPath = path.join(storyDir, 'config.json')
  const sourceConfig = JSON.parse(await fs.readFile(sourceConfigPath, 'utf8'))
  const authoredPages = deriveAuthoredPages(rawInventory)
  const config = buildV2Config(sourceConfig, authoredPages)
  validateAgeVariants(config)

  const subtitleDocuments = []
  const subtitlePaths = collectSubtitleTemplatePaths(config)
  for (const templatePath of subtitlePaths) {
    const absolutePath = path.join(storyDir, ...templatePath.split('/'))
    let document
    try {
      document = JSON.parse(await fs.readFile(absolutePath, 'utf8'))
    } catch (error) {
      throw new V2AuthoringError([`Cannot read subtitle template ${templatePath}: ${error instanceof Error ? error.message : error}`])
    }
    validateSubtitleDocument({
      document,
      templatePath,
      authoredPages,
      placeholderKeys: config.subtitle_render.placeholder_keys ?? [],
    })
    subtitleDocuments.push({ path: templatePath, document })
  }

  const fontsPath = config.subtitle_render.fonts_path
  if (fontsPath) {
    const normalizedFontsPath = normalizeRelativePath(fontsPath)
    const absoluteFontsPath = path.join(storyDir, ...normalizedFontsPath.split('/'))
    const entries = await fs.readdir(absoluteFontsPath, { withFileTypes: true }).catch(() => [])
    if (!entries.some((entry) => entry.isFile() && /\.(?:ttf|otf|woff2?)$/i.test(entry.name))) {
      throw new V2AuthoringError([`Font directory ${normalizedFontsPath} must contain at least one supported font file`])
    }
  }

  const workerContractResults = await validateWithWorkerContract({ config, subtitleDocuments, authoredPages })

  const report = {
    template_id: config.template_id,
    schema_version: config.schema_version,
    asset_layout: config.asset_layout,
    preview_pages: config.preview.page_indices.length,
    final_pages: config.final.page_indices.length,
    subtitle_templates: subtitlePaths,
    worker_contract: workerContractResults,
    assets: authoredPages.map((page) => ({
      path: page.assetPath,
      width: page.width,
      height: page.height,
      format: page.format,
      size: page.size,
      sha256: page.sha256,
      role: page.role,
      spread_index: page.spreadIndex,
      side: page.side,
      page_number: page.pageNumber,
      enable_face_swap: page.enableFaceSwap,
    })),
  }
  return { config, subtitleDocuments, report, authoredPages }
}

export async function writeAuthoringPackage({ outputDir, packageData }) {
  const outputExists = await fs.access(outputDir).then(() => true, () => false)
  if (outputExists) throw new V2AuthoringError([`Output directory already exists: ${outputDir}`])
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'config.json'), `${JSON.stringify(packageData.config, null, 2)}\n`)
  for (const subtitle of packageData.subtitleDocuments) {
    const target = path.join(outputDir, ...subtitle.path.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, `${JSON.stringify(subtitle.document, null, 2)}\n`)
  }
  await fs.writeFile(path.join(outputDir, 'authoring-report.json'), `${JSON.stringify(packageData.report, null, 2)}\n`)
}
