import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import sharp from 'sharp'
import {
  V2AuthoringError,
  buildAuthoringPackage,
  buildV2Config,
  deriveAuthoredPages,
  inventoryLocalAssets,
  validateSubtitleDocument,
  writeAuthoringPackage,
} from './lib.mjs'

const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function sourceConfig() {
  return {
    template_id: 'Adventure_story',
    base_path: 'app-templates/Adventure_story',
    pages: [
      { index: 0, template_image: 'preview_1.png', enable_face_swap: true, workflow_overrides: { preview_face: { prompt: 'cover prompt' } } },
      { index: 1, template_image: 'preview_2.png', enable_face_swap: true, workflow_overrides: { preview_face: { prompt: 'inside prompt' } } },
      { index: 2, template_image: 'page_01.png', enable_face_swap: true, workflow_overrides: { final_face: { prompt: 'spread one prompt' } } },
      { index: 3, template_image: 'page_02.png', enable_face_swap: true, workflow_overrides: { final_face: { prompt: 'spread two prompt' } } },
    ],
    preview: { page_indices: [0, 1] },
    final: { page_indices: [2, 3] },
    workflow: { provider: 'runpod', stages: { preview_face: { enabled: true }, final_face: { enabled: true } } },
    subtitle_render: { enabled: true, template_path: 'subtitle-template.json', fonts_path: 'fonts', placeholder_keys: ['name'] },
  }
}

function inventory() {
  const names = [
    ['preview0_A.webp', 'webp'],
    ['preview1_L_A.webp', 'webp'],
    ['preview1_R_B.webp', 'webp'],
    ['final/page0_L_B.png', 'png'],
    ['final/page0_R_A.png', 'png'],
    ['final/page01_L_A.png', 'png'],
    ['final/page01_R_B.png', 'png'],
    ['final/page02_L_B.png', 'png'],
    ['final/page02_R_A.png', 'png'],
  ]
  return names.map(([assetPath, format]) => ({ path: assetPath, format, width: 1024, height: 1024, size: 1000 }))
}

function subtitleDocument(pages) {
  return {
    story_id: 'Adventure_story-v2-single-page',
    pages: pages.map((page, index) => ({
      page: index + 1,
      image: page.templateImage,
      width: page.width,
      height: page.height,
      texts: index === 0 ? [{ content: "{name}'s Adventure" }] : [],
    })),
  }
}

async function createStoryFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ymi-v2-authoring-'))
  temporaryRoots.push(root)
  const storyDir = path.join(root, 'Adventure_story')
  const assetsDir = path.join(root, 'staging')
  await fs.mkdir(path.join(storyDir, 'fonts'), { recursive: true })
  await fs.mkdir(path.join(assetsDir, 'final'), { recursive: true })
  await fs.writeFile(path.join(storyDir, 'fonts', 'Lora-Regular.ttf'), 'fixture')
  await fs.writeFile(path.join(storyDir, 'config.json'), JSON.stringify(sourceConfig()))

  for (const item of inventory()) {
    const target = path.join(assetsDir, ...item.path.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    const image = sharp({ create: { width: item.width, height: item.height, channels: 3, background: '#ffffff' } })
    await (item.format === 'webp' ? image.webp() : image.png()).toFile(target)
  }
  const localInventory = await inventoryLocalAssets(assetsDir)
  const pages = deriveAuthoredPages(localInventory)
  await fs.writeFile(path.join(storyDir, 'subtitle-template.json'), JSON.stringify(subtitleDocument(pages)))
  return { root, storyDir, assetsDir, localInventory }
}

describe('V2 story authoring', () => {
  it('derives explicit dynamic metadata while keeping filename parsing in the authoring tool', () => {
    const pages = deriveAuthoredPages(inventory())
    const config = buildV2Config(sourceConfig(), pages)

    assert.equal(config.schema_version, 2)
    assert.equal(config.asset_layout, 'single-page')
    assert.equal(config.preview.page_indices.length, 3)
    assert.equal(config.final.page_indices.length, 6)
    assert.deepEqual(
      config.pages.map((page) => [page.presentation.role, page.presentation.spread_index, page.presentation.side ?? null, page.presentation.page_number ?? null, page.enable_face_swap]),
      [
        ['preview_cover', 0, null, null, true],
        ['preview_interior', 1, 'left', 1, true],
        ['preview_interior', 1, 'right', 2, false],
        ['final_back_cover', 0, 'left', null, false],
        ['final_front_cover', 0, 'right', null, true],
        ['final_interior', 1, 'left', 1, true],
        ['final_interior', 1, 'right', 2, false],
        ['final_interior', 2, 'left', 3, false],
        ['final_interior', 2, 'right', 4, true],
      ]
    )
    assert.equal(config.pages[0].workflow_overrides.preview_face.prompt, 'cover prompt')
    assert.equal(config.pages[4].workflow_overrides.final_face.prompt, 'cover prompt')
    assert.equal(config.pages[4].workflow_overrides.preview_face, undefined)
    assert.equal(config.pages[1].workflow_overrides.preview_face.prompt, 'inside prompt')
    assert.equal(config.pages[2].workflow_overrides, undefined)
    assert.equal(config.pages[5].workflow_overrides.final_face.prompt, 'spread one prompt')
    assert.equal(config.pages[7].workflow_overrides, undefined)
    assert.equal(config.pages[8].workflow_overrides.final_face.prompt, 'spread two prompt')
  })

  it('performs an Adventure_story dry run and writes only an explicit review directory', async () => {
    const fixture = await createStoryFixture()
    const packageData = await buildAuthoringPackage({ storyDir: fixture.storyDir, rawInventory: fixture.localInventory })
    assert.equal(packageData.report.preview_pages, 3)
    assert.equal(packageData.report.final_pages, 6)
    assert.equal(packageData.report.assets.length, 9)
    assert.deepEqual(packageData.report.worker_contract, [{
      template_path: 'subtitle-template.json',
      preview_pages: 3,
      final_pages: 6,
    }])

    const outputDir = path.join(fixture.root, 'review-output')
    await writeAuthoringPackage({ outputDir, packageData })
    const writtenConfig = JSON.parse(await fs.readFile(path.join(outputDir, 'config.json'), 'utf8'))
    const report = JSON.parse(await fs.readFile(path.join(outputDir, 'authoring-report.json'), 'utf8'))
    assert.equal(writtenConfig.template_id, 'Adventure_story')
    assert.equal(report.assets[0].sha256?.length, 64)
    assert.equal(await fs.readFile(path.join(fixture.storyDir, 'config.json'), 'utf8'), JSON.stringify(sourceConfig()))
  })

  it('keeps CLI dry runs write-free and rejects output inside the source story', async () => {
    const fixture = await createStoryFixture()
    const cliPath = path.resolve('scripts/v2-story-authoring.mjs')
    const dryRun = spawnSync(process.execPath, [
      cliPath,
      '--story-dir', fixture.storyDir,
      '--assets-dir', fixture.assetsDir,
    ], { encoding: 'utf8' })
    assert.equal(dryRun.status, 0, dryRun.stderr)
    assert.match(dryRun.stdout, /No files written/)
    assert.deepEqual((await fs.readdir(fixture.storyDir)).sort(), ['config.json', 'fonts', 'subtitle-template.json'])

    const unsafeOutput = path.join(fixture.storyDir, 'generated-v2')
    const unsafeWrite = spawnSync(process.execPath, [
      cliPath,
      '--story-dir', fixture.storyDir,
      '--assets-dir', fixture.assetsDir,
      '--write',
      '--out', unsafeOutput,
    ], { encoding: 'utf8' })
    assert.equal(unsafeWrite.status, 1)
    assert.match(unsafeWrite.stderr, /outside the source story directory/)
    await assert.rejects(fs.access(unsafeOutput))
  })

  it('rejects missing pairs, invalid face markers, format drift, and undersized images', () => {
    const missingRight = inventory().filter((asset) => asset.path !== 'final/page02_R_A.png')
    assert.throws(() => deriveAuthoredPages(missingRight), V2AuthoringError)

    const wrongCover = inventory().map((asset) => asset.path === 'final/page0_R_A.png' ? { ...asset, path: 'final/page0_R_B.png' } : asset)
    assert.throws(() => deriveAuthoredPages(wrongCover), /Final front cover/)

    const wrongBytes = inventory().map((asset) => asset.path === 'preview0_A.webp' ? { ...asset, format: 'png' } : asset)
    assert.throws(() => deriveAuthoredPages(wrongBytes), /bytes must be webp/)

    const tooSmall = inventory().map((asset) => asset.path === 'final/page01_L_A.png' ? { ...asset, width: 511 } : asset)
    assert.throws(() => deriveAuthoredPages(tooSmall), /at least 512px/)
  })

  it('requires exact subtitle coverage, dimensions, explicit no-op arrays, and declared placeholders', () => {
    const pages = deriveAuthoredPages(inventory())
    const valid = subtitleDocument(pages)
    assert.doesNotThrow(() => validateSubtitleDocument({ document: valid, templatePath: 'subtitle-template.json', authoredPages: pages, placeholderKeys: ['name'] }))

    const missing = structuredClone(valid)
    missing.pages.pop()
    assert.throws(() => validateSubtitleDocument({ document: missing, templatePath: 'subtitle-template.json', authoredPages: pages, placeholderKeys: ['name'] }), /missing subtitle entry/)

    const badDimensions = structuredClone(valid)
    badDimensions.pages[0].width = 999
    assert.throws(() => validateSubtitleDocument({ document: badDimensions, templatePath: 'subtitle-template.json', authoredPages: pages, placeholderKeys: ['name'] }), /dimensions must match/)

    const missingTexts = structuredClone(valid)
    delete missingTexts.pages[1].texts
    assert.throws(() => validateSubtitleDocument({ document: missingTexts, templatePath: 'subtitle-template.json', authoredPages: pages, placeholderKeys: ['name'] }), /must define texts as an array/)

    const undeclared = structuredClone(valid)
    undeclared.pages[0].texts[0].content = '{child_name}'
    assert.throws(() => validateSubtitleDocument({ document: undeclared, templatePath: 'subtitle-template.json', authoredPages: pages, placeholderKeys: ['name'] }), /undeclared placeholder/)
  })
})
