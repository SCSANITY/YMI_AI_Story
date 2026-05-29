import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const defaultTemplateRoot = path.join(workspaceRoot, 'Template_folder')

const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const storyIds = args.filter((arg) => !arg.startsWith('--')).map((arg) => arg.trim()).filter(Boolean)

const isApply = flags.has('--apply')
const force = flags.has('--force')
const templateRoot = process.env.TEMPLATE_PRODUCTS_ROOT
  ? path.resolve(process.env.TEMPLATE_PRODUCTS_ROOT)
  : defaultTemplateRoot
const maxWidth = Number(process.env.PRODUCT_WEBP_MAX_WIDTH || 1600)
const quality = Number(process.env.PRODUCT_WEBP_QUALITY || 84)

const PRODUCT_SOURCE_PATTERN = /^product(\d+)\.(png|jpe?g|webp)$/i

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function listStoryDirs() {
  const entries = await fs.readdir(templateRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .filter((storyId) => !storyIds.length || storyIds.includes(storyId))
    .sort((a, b) => a.localeCompare(b))
}

async function optimizeProductImage(inputPath, outputPath) {
  await sharp(inputPath)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxWidth,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      alphaQuality: 90,
      effort: 5,
    })
    .toFile(outputPath)
}

async function main() {
  const mode = isApply ? 'apply' : 'dry-run'
  console.log(`Template product optimization ${mode}`)
  console.log(`Template root: ${templateRoot}`)
  console.log(`Output: Product/productN.webp, maxWidth=${maxWidth}, quality=${quality}`)
  if (!isApply) console.log('Use --apply to write files.')
  if (force) console.log('Force mode enabled: existing WebP files will be overwritten.')

  if (!(await pathExists(templateRoot))) {
    throw new Error(`Template folder not found: ${templateRoot}`)
  }

  const storyDirs = await listStoryDirs()
  let sourceCount = 0
  let writeCount = 0
  let skipCount = 0

  for (const storyId of storyDirs) {
    const productDir = path.join(templateRoot, storyId, 'Product')
    if (!(await pathExists(productDir))) continue

    const files = (await fs.readdir(productDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .flatMap((entry) => {
        const match = entry.name.match(PRODUCT_SOURCE_PATTERN)
        if (!match) return []
        return [{
          name: entry.name,
          order: Number(match[1]),
          extension: match[2].toLowerCase(),
        }]
      })
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))

    if (!files.length) continue

    console.log(`\n${storyId}`)
    for (const file of files) {
      sourceCount += 1
      const inputPath = path.join(productDir, file.name)
      const outputName = `product${file.order}.webp`
      const outputPath = path.join(productDir, outputName)
      const outputExists = await pathExists(outputPath)

      if (file.extension === 'webp' && file.name.toLowerCase() === outputName.toLowerCase()) {
        console.log(`  [keep] ${file.name}`)
        skipCount += 1
        continue
      }

      if (outputExists && !force) {
        console.log(`  [skip] ${file.name} -> ${outputName} already exists`)
        skipCount += 1
        continue
      }

      console.log(`  [${isApply ? 'write' : 'dry'}] ${file.name} -> ${outputName}`)
      if (isApply) {
        await optimizeProductImage(inputPath, outputPath)
      }
      writeCount += 1
    }
  }

  console.log(`\nDone. sources=${sourceCount}, ${isApply ? 'written' : 'wouldWrite'}=${writeCount}, skipped=${skipCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
