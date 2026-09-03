import path from 'node:path'
import {
  V3AuthoringError,
  buildAuthoringPackage,
  inventoryLocalAssets,
  readInventoryFile,
  writeAuthoringPackage,
} from './v3-authoring/lib.mjs'

function parseArgs(argv) {
  const options = { write: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--write') options.write = true
    else if (arg === '--story-dir' || arg === '--assets-dir' || arg === '--inventory' || arg === '--out') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
      index += 1
    } else if (arg === '--help') options.help = true
    else throw new Error(`Unknown argument ${arg}`)
  }
  return options
}

function usage() {
  return [
    'Usage:',
    '  npm run v3:author -- --story-dir <story> --assets-dir <staging>',
    '  npm run v3:author -- --story-dir <story> --inventory <inventory.json>',
    '',
    'Default mode validates and prints a dry-run report without writing files.',
    'Add --write --out <review-dir> to create a review package.',
    'Existing output directories are never replaced.',
  ].join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  if (!options.storyDir) throw new Error('--story-dir is required')
  if (Boolean(options.assetsDir) === Boolean(options.inventory)) {
    throw new Error('Provide exactly one of --assets-dir or --inventory')
  }
  if (options.write && !options.out) throw new Error('--write requires --out')
  if (!options.write && options.out) throw new Error('--out is only valid with --write')

  const storyDir = path.resolve(options.storyDir)
  const rawInventory = options.assetsDir
    ? await inventoryLocalAssets(path.resolve(options.assetsDir))
    : await readInventoryFile(path.resolve(options.inventory))
  const packageData = await buildAuthoringPackage({ storyDir, rawInventory })

  console.log(`V3 authoring dry run passed: ${packageData.report.template_id}`)
  console.log(`Preview pages: ${packageData.report.preview_pages}`)
  console.log(`Final pages: ${packageData.report.final_pages}`)
  console.log(`Subtitle templates: ${packageData.report.subtitle_templates.join(', ')}`)
  console.log(`Assets checked: ${packageData.report.assets.length}`)

  if (options.write) {
    const outputDir = path.resolve(options.out)
    const relativeToStory = path.relative(storyDir, outputDir)
    if (!relativeToStory || (!relativeToStory.startsWith('..') && !path.isAbsolute(relativeToStory))) {
      throw new V3AuthoringError(['Review output must be outside the source story directory'])
    }
    await writeAuthoringPackage({ outputDir, packageData })
    console.log(`Review package written: ${outputDir}`)
  } else {
    console.log('No files written. Add --write --out <review-dir> after reviewing the dry run.')
  }
}

main().catch((error) => {
  if (error instanceof V3AuthoringError) console.error(error.message)
  else console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
