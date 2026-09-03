import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import sharp from 'sharp'
import {
  V3AuthoringError,
  buildAuthoringPackage,
  buildV3Config,
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
    ['final/page0_R_A.png', 'png'],
    ...Array.from({ length: 15 }, (_, index) => {
      const spread = String(index + 1).padStart(2, '0')
      return [
        [`final/page${spread}_L_${index === 0 ? 'A' : 'B'}.png`, 'png'],
        [`final/page${spread}_R_${index === 1 ? 'A' : 'B'}.png`, 'png'],
      ]
    }).flat(),
  ]
  return names.map(([assetPath, format]) => ({ path: assetPath, format, width: 1024, height: 1024, size: 1000 }))
}

function subtitleDocument(pages) {
  return {
    story_id: 'Adventure_story-v3-single-page',
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ymi-v3-authoring-'))
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

describe('V3 story authoring', () => {
  it('derives explicit dynamic metadata while keeping filename parsing in the authoring tool', () => {
    const pages = deriveAuthoredPages(inventory())
    const config = buildV3Config(sourceConfig(), pages)

    assert.equal(config.schema_version, 3)
    assert.equal(config.asset_layout, 'single-page')
    assert.equal(config.preview.page_indices.length, 3)
    assert.equal(config.final.page_indices.length, 31)
    assert.deepEqual(
      config.pages.slice(0, 8).map((page) => [page.presentation.role, page.presentation.spread_index, page.presentation.side ?? null, page.presentation.page_number ?? null, page.enable_face_swap]),
      [
        ['preview_cover', 0, null, null, true],
        ['preview_interior', 1, 'left', 1, true],
        ['preview_interior', 1, 'right', 2, false],
        ['final_front_cover', 0, null, null, true],
        ['final_interior', 1, 'left', 1, true],
        ['final_interior', 1, 'right', 2, false],
        ['final_interior', 2, 'left', 3, false],
        ['final_interior', 2, 'right', 4, true],
      ]
    )
    assert.equal(config.pages[0].workflow_overrides.preview_face.prompt, 'cover prompt')
    assert.equal(config.pages[3].workflow_overrides.final_face.prompt, 'cover prompt')
    assert.equal(config.pages[3].workflow_overrides.preview_face, undefined)
    assert.equal(config.pages[1].workflow_overrides.preview_face.prompt, 'inside prompt')
    assert.equal(config.pages[2].workflow_overrides, undefined)
    assert.equal(config.pages[4].workflow_overrides.final_face.prompt, 'spread one prompt')
    assert.equal(config.pages[6].workflow_overrides, undefined)
    assert.equal(config.pages[7].workflow_overrides.final_face.prompt, 'spread two prompt')
  })

  it('performs an Adventure_story dry run and writes only an explicit review directory', async () => {
    const fixture = await createStoryFixture()
    const packageData = await buildAuthoringPackage({ storyDir: fixture.storyDir, rawInventory: fixture.localInventory })
    assert.equal(packageData.report.preview_pages, 3)
    assert.equal(packageData.report.final_pages, 31)
    assert.equal(packageData.report.assets.length, 34)
    assert.deepEqual(packageData.report.worker_contract, [{
      template_path: 'subtitle-template.json',
      preview_pages: 3,
      final_pages: 31,
    }])

    const outputDir = path.join(fixture.root, 'review-output')
    await writeAuthoringPackage({ outputDir, packageData })
    const writtenConfig = JSON.parse(await fs.readFile(path.join(outputDir, 'config.json'), 'utf8'))
    const report = JSON.parse(await fs.readFile(path.join(outputDir, 'authoring-report.json'), 'utf8'))
    assert.equal(writtenConfig.template_id, 'Adventure_story')
    assert.equal(report.assets[0].sha256?.length, 64)
    assert.equal(await fs.readFile(path.join(fixture.storyDir, 'config.json'), 'utf8'), JSON.stringify(sourceConfig()))
  })

  it('never copies a V2 cover override onto an interior whose A/B marker changed', () => {
    const v2 = sourceConfig()
    v2.pages = [
      {
        index: 0,
        template_image: 'preview0_A.webp',
        enable_face_swap: true,
        presentation: { role: 'preview_cover', spread_index: 0 },
        workflow_overrides: { preview_face: { prompt: 'preview cover prompt' } },
      },
      {
        index: 1,
        template_image: 'preview1_L_B.webp',
        enable_face_swap: false,
        presentation: { role: 'preview_interior', spread_index: 1, side: 'left', page_number: 1 },
      },
      {
        index: 2,
        template_image: 'preview1_R_A.webp',
        enable_face_swap: true,
        presentation: { role: 'preview_interior', spread_index: 1, side: 'right', page_number: 2 },
        workflow_overrides: { preview_face: { prompt: 'preview right prompt' } },
      },
      {
        index: 3,
        template_image: 'page0_L_B.png',
        enable_face_swap: false,
        presentation: { role: 'final_back_cover', spread_index: 0, side: 'left' },
      },
      {
        index: 4,
        template_image: 'page0_R_A.png',
        enable_face_swap: true,
        presentation: { role: 'final_front_cover', spread_index: 0, side: 'right' },
        workflow_overrides: { final_face: { prompt: 'final cover prompt' } },
      },
      ...Array.from({ length: 15 }, (_, index) => {
        const spread = index + 1
        return ['left', 'right'].map((side, sideIndex) => ({
          index: 5 + index * 2 + sideIndex,
          template_image: `page${String(spread).padStart(2, '0')}_${side === 'left' ? 'L' : 'R'}_B.png`,
          enable_face_swap: false,
          presentation: {
            role: 'final_interior',
            spread_index: spread,
            side,
            page_number: index * 2 + sideIndex + 1,
          },
        }))
      }).flat(),
    ]
    v2.preview = { page_indices: [0, 1, 2] }
    v2.final = { page_indices: Array.from({ length: 32 }, (_, index) => index + 3) }

    const config = buildV3Config(v2, deriveAuthoredPages(inventory()))
    const finalCover = config.pages.find((page) => page.presentation.role === 'final_front_cover')
    const spreadTwoRight = config.pages.find((page) =>
      page.presentation.role === 'final_interior' &&
      page.presentation.spread_index === 2 &&
      page.presentation.side === 'right'
    )

    assert.equal(finalCover.workflow_overrides.final_face.prompt, 'final cover prompt')
    assert.equal(spreadTwoRight.enable_face_swap, true)
    assert.equal(spreadTwoRight.workflow_overrides, undefined)
  })

  it('keeps CLI dry runs write-free and rejects output inside the source story', async () => {
    const fixture = await createStoryFixture()
    const cliPath = path.resolve('scripts/v3-story-authoring.mjs')
    const dryRun = spawnSync(process.execPath, [
      cliPath,
      '--story-dir', fixture.storyDir,
      '--assets-dir', fixture.assetsDir,
    ], { encoding: 'utf8' })
    assert.equal(dryRun.status, 0, dryRun.stderr)
    assert.match(dryRun.stdout, /No files written/)
    assert.deepEqual((await fs.readdir(fixture.storyDir)).sort(), ['config.json', 'fonts', 'subtitle-template.json'])

    const unsafeOutput = path.join(fixture.storyDir, 'generated-v3')
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
    assert.throws(() => deriveAuthoredPages(missingRight), V3AuthoringError)

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
