import path from 'path'
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas'
import type { InputSnapshot, TemplateConfig } from './processor'

const MIN_BOX_WIDTH = 32
const MIN_BOX_HEIGHT = 24
const MIN_FONT_SIZE = 8

export type SubtitleRenderConfig = {
  enabled?: boolean
  template_path?: string
  fonts_path?: string
  placeholder_keys?: string[]
  template_variants?: Array<{
    id?: string
    template_path?: string
    when?: {
      child_age_min?: number
      child_age_max?: number
    }
  }>
  page_runtime_images?: {
    preview?: Record<string, string>
    final?: Record<string, string>
  }
}

export type SubtitleTemplateText = {
  [key: string]: unknown
  content?: string
  x?: number
  y?: number
  font?: string
  size?: number
  fontWeight?: number
  role?: string
  fill?: SubtitleFill
  color?: string
  customColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  verticalAlign?: string
  textureImage?: string | null
  shadow?: boolean
  shadowColor?: string
  shadowOpacity?: number
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  autoScale?: boolean
  maxWidth?: number
  boxWidth?: number
  boxHeight?: number
  boxPaddingTop?: number
  boxPaddingRight?: number
  boxPaddingBottom?: number
  boxPaddingLeft?: number
  letterSpacing?: number
  lineHeight?: number
  opacity?: number
  boxStyle?: string
  boxFillColor?: string
  boxFillOpacity?: number
  boxBorderColor?: string
  boxBorderOpacity?: number
  boxBorderWidth?: number
  boxRadius?: number
  boxFadeEdges?: boolean
  boxPaddingX?: number
  boxPaddingY?: number
  textAlign?: string
  textTransform?: string
  stroke?: boolean
  strokeColor?: string
  strokeOpacity?: number
  strokeWidth?: number
  bevel?: boolean
  bevelDepth?: number
  bevelHighlight?: string
  bevelShadow?: string
  bevelTexture?: string | null
  glow?: boolean
  glowColor?: string
  glowBlur?: number
  glowOpacity?: number
  nameStyle?: Record<string, unknown> | null
  spans?: SubtitleTextSpan[]
}

export type SubtitleTextSpan = {
  start?: number
  end?: number
  style?: Record<string, unknown>
}

export type SubtitleFill =
  | { type?: 'solid'; color?: string }
  | { type: 'linearGradient'; angle?: number; stops?: Array<{ offset?: number; color?: string }> }
  | { type: 'texture'; image?: string }

export type SubtitleTemplatePage = {
  page?: number
  image: string
  width?: number
  height?: number
  texts?: SubtitleTemplateText[]
}

export type SubtitleTemplateDocument = {
  story_id?: string
  generated_at?: string
  pages: SubtitleTemplatePage[]
}

export type SubtitleFontAsset = {
  fileName: string
  buffer: Buffer
}

export type LoadedSubtitleTemplate = {
  storagePath: string
  fontsPath: string | null
  document: SubtitleTemplateDocument
  pageMap: Map<string, SubtitleTemplatePage>
  fontAssets: SubtitleFontAsset[]
}

export type SubtitleRenderState = {
  page_index: number
  status: string
  started_at?: string
  finished_at?: string
  template_image: string
  subtitle_template_path: string | null
  rendered_storage_path?: string | null
  error?: string | null
  timings?: SubtitleRenderTimings | null
}

export type SubtitleRenderTimings = {
  template_download_ms?: number
  render_ms?: number
  subtitle_upload_ms?: number
  subtitle_sign_ms?: number
  workflow_prepare_ms?: number
  provider_handoff_ms?: number
  output_upload_ms?: number
  total_page_ms?: number
}

type CanvasTextContext = ReturnType<ReturnType<typeof createCanvas>['getContext']>

const registeredFontAliases = new Set<string>()

export function getSubtitleRenderConfig(config: TemplateConfig): SubtitleRenderConfig | null {
  const raw = (config as TemplateConfig & { subtitle_render?: SubtitleRenderConfig }).subtitle_render
  if (!raw || typeof raw !== 'object') return null
  return raw
}

export function isSubtitleRenderEnabled(config: TemplateConfig): boolean {
  return getSubtitleRenderConfig(config)?.enabled === true
}

export function getChildName(inputSnapshot: InputSnapshot | null | undefined): string {
  const textOverrides = inputSnapshot?.text_overrides
  const raw = textOverrides?.child_name ?? textOverrides?.childName
  if (typeof raw === 'string') return raw.trim()
  if (raw != null) return String(raw).trim()
  return ''
}

export function parseSubtitleTemplateDocument(raw: string): SubtitleTemplateDocument {
  const cleaned = removeTrailingCommas(stripJsonComments(raw))
  const parsed = JSON.parse(cleaned) as Partial<SubtitleTemplateDocument>
  if (!parsed || !Array.isArray(parsed.pages)) {
    throw new Error('Invalid subtitle template JSON: missing pages array')
  }

  const pages = parsed.pages.map((page) => {
    if (!page || typeof page !== 'object' || typeof page.image !== 'string' || !page.image.trim()) {
      throw new Error('Invalid subtitle template JSON: each page must include image')
    }
    return {
      ...page,
      image: page.image.trim(),
      texts: Array.isArray(page.texts) ? page.texts : [],
    }
  })

  return {
    story_id: parsed.story_id,
    generated_at: parsed.generated_at,
    pages,
  }
}

export function buildSubtitlePageMap(
  document: SubtitleTemplateDocument
): Map<string, SubtitleTemplatePage> {
  const pageMap = new Map<string, SubtitleTemplatePage>()
  for (const page of document.pages) {
    if (pageMap.has(page.image)) {
      throw new Error(`Duplicate subtitle template page entry for image ${page.image}`)
    }
    pageMap.set(page.image, page)
  }
  return pageMap
}

export function createLoadedSubtitleTemplate(args: {
  config: SubtitleRenderConfig
  templateStoragePath: string
  templateRaw: string
  fontAssets: SubtitleFontAsset[]
}): LoadedSubtitleTemplate {
  const document = parseSubtitleTemplateDocument(args.templateRaw)
  return {
    storagePath: args.templateStoragePath,
    fontsPath: args.config.fonts_path?.trim() || null,
    document,
    pageMap: buildSubtitlePageMap(document),
    fontAssets: args.fontAssets,
  }
}

export async function renderSubtitlePage(args: {
  baseImage: Buffer
  subtitlePage: SubtitleTemplatePage
  childName: string
  fontAssets: SubtitleFontAsset[]
}): Promise<Buffer> {
  registerFontAssets(args.fontAssets)

  const baseImage = await loadImage(args.baseImage)
  const authoringWidth = Math.max(1, Math.round(args.subtitlePage.width ?? baseImage.width))
  const authoringHeight = Math.max(1, Math.round(args.subtitlePage.height ?? baseImage.height))
  const canvas = createCanvas(authoringWidth, authoringHeight)
  const ctx = canvas.getContext('2d')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, authoringWidth, authoringHeight)
  ctx.drawImage(baseImage, 0, 0, authoringWidth, authoringHeight)

  const texts = Array.isArray(args.subtitlePage.texts) ? args.subtitlePage.texts : []
  for (const item of texts) {
    await drawTextItem(ctx, item, args.childName)
  }

  return canvas.toBuffer('image/png')
}

type ResolvedTextStyle = SubtitleTemplateText & {
  font: string
  size: number
  fontWeight: number
  bold: boolean
  italic: boolean
  letterSpacing: number
  lineHeight: number
  fill: SubtitleFill
}

type Padding = {
  top: number
  right: number
  bottom: number
  left: number
}

type TextLine = {
  text: string
  width: number
}

type MixedRun = {
  raw: string
  text: string
  isName: boolean
  isSpace: boolean
  width: number
  style: ResolvedTextStyle
}

type MixedWord = {
  runs: MixedRun[]
  isSpace: boolean
  isNewline?: boolean
  width: number
}

const PRESET_GRADIENT_STOPS: Record<string, string[]> = {
  gold_gradient: ['#F5D478', '#C8922A', '#F5E6A3', '#A67620'],
  silver_gradient: ['#FFFFFF', '#888888', '#F0F0F0', '#585858'],
  bronze_gradient: ['#FFD07A', '#7A3E0E', '#D4904A', '#4A2006'],
  rosegold_gradient: ['#FFD8C0', '#B06040', '#F0B898', '#803828'],
  wood_gradient: ['#D4A96A', '#8B5E3C', '#E8C896', '#5C3A1E'],
  copper_gradient: ['#E8A055', '#7A4010', '#F5C880', '#4A2008'],
  forest_gradient: ['#7EC858', '#1E5C2A', '#B8E890', '#0A3D18'],
  jade_gradient: ['#90D0A0', '#1A6B3A', '#C0E8C8', '#0D4A22'],
  ocean_gradient: ['#7EC8E3', '#0A5C8C', '#C5E8F5', '#043E5C'],
  midnight_gradient: ['#A0C4E8', '#1A3A6B', '#D8E8F8', '#0A1E4A'],
  amethyst_gradient: ['#C89FE3', '#6B3A9C', '#E8D5F8', '#4A1E78'],
  ruby_gradient: ['#F5A0A0', '#8B1010', '#F8D0D0', '#5A0808'],
  coral_gradient: ['#FF9B7A', '#CC4030', '#FFCBA8', '#8B2018'],
}

const RUN_STYLE_KEYS = [
  'font',
  'size',
  'fontWeight',
  'bold',
  'italic',
  'letterSpacing',
  'textTransform',
  'textureImage',
  'fill',
  'color',
  'customColor',
  'customGradientStart',
  'customGradientEnd',
  'customGradientAngle',
  'shadow',
  'shadowColor',
  'shadowOpacity',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'stroke',
  'strokeWidth',
  'strokeColor',
  'strokeOpacity',
  'bevel',
  'bevelDepth',
  'bevelHighlight',
  'bevelShadow',
  'glow',
  'glowColor',
  'glowBlur',
  'glowOpacity',
] as const

async function drawTextItem(ctx: CanvasTextContext, item: SubtitleTemplateText, childName: string): Promise<void> {
  const rawContent = typeof item.content === 'string' ? item.content : ''
  if (!rawContent.trim()) return

  const bx = numberOr(item.x, 0)
  const by = numberOr(item.y, 0)
  const bw = Math.max(MIN_BOX_WIDTH, numberOr(item.boxWidth ?? item.maxWidth, 220))
  const bh = Math.max(MIN_BOX_HEIGHT, numberOr(item.boxHeight, 90))
  const opacity = clampNumber(numberOr(item.opacity, 1), 0, 1)
  const pad = resolvePadding(item)
  const availW = Math.max(1, bw - pad.left - pad.right)
  const baseStyle = resolveTextStyle(item)

  ctx.save()
  await drawSpecBox(ctx, item, bx, by, bw, bh, opacity)

  const nameStyle = resolveEffectiveNameStyle(item, baseStyle)
  const hasNameStyle = Boolean(nameStyle && rawContent.includes('{name}'))
  const hasSpans = Array.isArray(item.spans) && item.spans.some((span) => {
    const start = numberOr(span?.start, 0)
    const end = numberOr(span?.end, 0)
    return Boolean(span?.style && end > start)
  })

  if (hasNameStyle || hasSpans) {
    await drawMixedText(ctx, {
      item,
      baseStyle,
      nameStyle,
      rawContent,
      childName,
      bx,
      by,
      bw,
      bh,
      pad,
      availW,
      opacity,
    })
  } else {
    await drawSingleStyleText(ctx, {
      item,
      style: baseStyle,
      content: applyTextTransform(rawContent, item.textTransform).replace(/\{name\}/g, childName),
      bx,
      by,
      bw,
      bh,
      pad,
      availW,
      opacity,
    })
  }
  ctx.restore()
}

async function drawSpecBox(
  ctx: CanvasTextContext,
  item: SubtitleTemplateText,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  opacity: number
) {
  const radius = Math.max(0, numberOr(item.boxRadius, 0))
  const fillOpacity = clampNumber(numberOr(item.boxFillOpacity, 0), 0, 1)
  const borderOpacity = clampNumber(numberOr(item.boxBorderOpacity, 0), 0, 1)
  const borderWidth = Math.max(0, numberOr(item.boxBorderWidth, 0))

  if (fillOpacity > 0) {
    ctx.save()
    if (item.boxFadeEdges) {
      ctx.globalAlpha = opacity
      beginRoundRect(ctx, bx, by, bw, bh, radius)
      ctx.clip()
      ctx.translate(bx + bw / 2, by + bh / 2)
      ctx.scale(bw / 2, bh / 2)
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      const color = String(item.boxFillColor ?? '#FFFFFF')
      gradient.addColorStop(0, hexToRgba(color, fillOpacity * 0.72))
      gradient.addColorStop(0.38, hexToRgba(color, fillOpacity * 0.48))
      gradient.addColorStop(0.68, hexToRgba(color, fillOpacity * 0.18))
      gradient.addColorStop(1, hexToRgba(color, 0))
      ctx.fillStyle = gradient
      ctx.fillRect(-1, -1, 2, 2)
    } else {
      ctx.globalAlpha = opacity * fillOpacity
      ctx.fillStyle = String(item.boxFillColor ?? '#0F172A')
      beginRoundRect(ctx, bx, by, bw, bh, radius)
      ctx.fill()
    }
    ctx.restore()
  }

  if (borderWidth > 0 && borderOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = opacity * borderOpacity
    ctx.strokeStyle = String(item.boxBorderColor ?? '#FFFFFF')
    ctx.lineWidth = borderWidth
    beginRoundRect(ctx, bx, by, bw, bh, radius)
    ctx.stroke()
    ctx.restore()
  }
}

async function drawSingleStyleText(
  ctx: CanvasTextContext,
  args: {
    item: SubtitleTemplateText
    style: ResolvedTextStyle
    content: string
    bx: number
    by: number
    bw: number
    bh: number
    pad: Padding
    availW: number
    opacity: number
  }
) {
  const { style, content, bx, by, bw, bh, pad, availW, opacity } = args
  const lineH = style.size * style.lineHeight
  setCanvasTextStyle(ctx, style)
  const lines = wrapTextCanvas(ctx, content, availW)
  const vOffset = resolveVerticalOffset(args.item.verticalAlign, bh, pad, lines.length, lineH)
  const align = normalizeTextAlign(args.item.textAlign)
  const anchorX = resolveAnchorX(align, bx, bw, pad, availW)
  const baselineFor = (index: number) => by + pad.top + vOffset + style.size + index * lineH

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'

  const drawLines = (draw: (line: string, x: number, y: number) => void) => {
    lines.forEach((line, index) => draw(line.text, anchorX, baselineFor(index)))
  }

  drawGlowPass(ctx, [style], (drawToken) => drawLines(drawToken))
  await drawBevelPass(ctx, style, (drawToken, offsetX, offsetY) => {
    drawLines((line, x, y) => drawToken(line, x + offsetX, y + offsetY))
  })
  drawShadowPass(ctx, [style], (drawToken) => drawLines(drawToken))
  clearShadow(ctx)
  drawStrokePass(ctx, [style], (drawToken) => drawLines(drawToken))
  await drawFillPass(ctx, style, { x: bx, y: by, width: bw, height: bh }, (drawToken) => {
    drawLines(drawToken)
  })
  if (args.item.underline) {
    lines.forEach((line, index) => drawUnderline(ctx, line.text, anchorX, baselineFor(index), style, align))
  }
  ctx.restore()
}

async function drawMixedText(
  ctx: CanvasTextContext,
  args: {
    item: SubtitleTemplateText
    baseStyle: ResolvedTextStyle
    nameStyle: ResolvedTextStyle | null
    rawContent: string
    childName: string
    bx: number
    by: number
    bw: number
    bh: number
    pad: Padding
    availW: number
    opacity: number
  }
) {
  const { item, baseStyle, nameStyle, rawContent, childName, bx, by, bw, bh, pad, availW, opacity } = args
  const words = createMixedWords(ctx, rawContent, childName, baseStyle, nameStyle, item.spans)
  const allRuns = words.flatMap((word) => word.runs)
  const lineH = Math.max(
    baseStyle.size * baseStyle.lineHeight,
    ...allRuns.map((run) => run.style.size * numberOr(run.style.lineHeight, baseStyle.lineHeight))
  )
  const lines = packMixedWords(words, availW)
  const vOffset = resolveVerticalOffset(item.verticalAlign, bh, pad, lines.length, lineH)
  const align = normalizeTextAlign(item.textAlign)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const lineContentWidth = (line: MixedWord[]) => {
    let start = 0
    let end = line.length
    while (start < end && line[start].isSpace) start += 1
    while (end > start && line[end - 1].isSpace) end -= 1
    let width = 0
    for (let index = start; index < end; index += 1) width += line[index].width
    return width
  }

  const lineStartX = (line: MixedWord[]) => {
    const lineWidth = lineContentWidth(line)
    if (align === 'center') return bx + pad.left + availW / 2 - lineWidth / 2
    if (align === 'right') return bx + bw - pad.right - lineWidth
    return bx + pad.left
  }

  const forEachRun = (callback: (run: MixedRun, x: number, y: number, lineIndex: number) => void) => {
    lines.forEach((line, lineIndex) => {
      let x = lineStartX(line)
      const y = by + pad.top + vOffset + baseStyle.size + lineIndex * lineH
      for (const word of line) {
        for (const run of word.runs) {
          callback(run, x, y, lineIndex)
          x += run.width
        }
      }
    })
  }

  forEachRun((run, x, y) => {
    if (!run.text || run.isSpace || !run.style.glow) return
    ctx.save()
    setCanvasTextStyle(ctx, run.style)
    ctx.shadowColor = hexToRgba(String(run.style.glowColor ?? '#FFD700'), clampNumber(numberOr(run.style.glowOpacity, 0.85), 0, 1))
    ctx.shadowBlur = numberOr(run.style.glowBlur, 20)
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.fillStyle = String(run.style.glowColor ?? '#FFD700')
    for (let i = 0; i < 3; i += 1) ctx.fillText(run.text, x, y)
    ctx.restore()
  })

  forEachRun((run, x, y) => {
    if (!run.text || run.isSpace || !run.style.bevel) return
    ctx.save()
    setCanvasTextStyle(ctx, run.style)
    const depth = Math.max(1, Math.round(numberOr(run.style.bevelDepth, 4)))
    const inheritedAlpha = ctx.globalAlpha
    for (let i = depth; i >= 1; i -= 1) {
      const alpha = 0.08 + ((depth - i + 1) / depth) * 0.42
      ctx.globalAlpha = inheritedAlpha
      ctx.fillStyle = hexToRgba(String(run.style.bevelShadow ?? '#000000'), alpha)
      ctx.fillText(run.text, x + i, y + i)
    }
    ctx.globalAlpha = inheritedAlpha
    ctx.fillStyle = hexToRgba(String(run.style.bevelHighlight ?? '#FFFFFF'), 0.35)
    ctx.fillText(run.text, x - 1, y - 1)
    ctx.restore()
  })

  forEachRun((run, x, y) => {
    if (!run.text || run.isSpace || !run.style.shadow) return
    ctx.save()
    setCanvasTextStyle(ctx, run.style)
    ctx.shadowColor = hexToRgba(String(run.style.shadowColor ?? '#000000'), clampNumber(numberOr(run.style.shadowOpacity, 0.5), 0, 1))
    ctx.shadowBlur = numberOr(run.style.shadowBlur, 8)
    ctx.shadowOffsetX = numberOr(run.style.shadowOffsetX, 2)
    ctx.shadowOffsetY = numberOr(run.style.shadowOffsetY, 4)
    ctx.fillStyle = hexToRgba(String(run.style.shadowColor ?? '#000000'), 1)
    ctx.fillText(run.text, x, y)
    ctx.restore()
  })

  clearShadow(ctx)

  forEachRun((run, x, y) => {
    if (!run.text || run.isSpace || !run.style.stroke) return
    ctx.save()
    setCanvasTextStyle(ctx, run.style)
    ctx.lineWidth = numberOr(run.style.strokeWidth, 4)
    ctx.strokeStyle = hexToRgba(String(run.style.strokeColor ?? '#000000'), clampNumber(numberOr(run.style.strokeOpacity, 1), 0, 1))
    ctx.lineJoin = 'round'
    ctx.strokeText(run.text, x, y)
    ctx.restore()
  })

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    let x = lineStartX(line)
    const y = by + pad.top + vOffset + baseStyle.size + lineIndex * lineH
    for (const word of line) {
      for (const run of word.runs) {
        if (run.text && !run.isSpace) {
          setCanvasTextStyle(ctx, run.style)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'alphabetic'
          await drawFillPass(
            ctx,
            run.style,
            { x, y: y - run.style.size, width: Math.max(1, run.width), height: run.style.size },
            (drawToken) => drawToken(run.text, x, y)
          )
          if (item.underline) {
            drawUnderline(ctx, run.text, x, y, run.style, 'left')
          }
        }
        x += run.width
      }
    }
  }

  ctx.restore()
}

function createMixedWords(
  ctx: CanvasTextContext,
  rawContent: string,
  childName: string,
  baseStyle: ResolvedTextStyle,
  nameStyle: ResolvedTextStyle | null,
  spans: SubtitleTextSpan[] | undefined
): MixedWord[] {
  const validSpans = Array.isArray(spans)
    ? spans.filter((span) => span?.style && numberOr(span.end, 0) > numberOr(span.start, 0))
    : []
  const styleCache = new Map<string, ResolvedTextStyle>()
  const spanAt = (rawOffset: number) => {
    let style: Record<string, unknown> | null = null
    let index = -1
    for (let spanIndex = 0; spanIndex < validSpans.length; spanIndex += 1) {
      const span = validSpans[spanIndex]
      const start = numberOr(span.start, 0)
      const end = numberOr(span.end, 0)
      if (rawOffset >= start && rawOffset < end) {
        style = span.style ?? null
        index = spanIndex
      }
    }
    return { style, index }
  }
  const resolveCachedStyle = (isName: boolean, spanIndex: number, spanStyle: Record<string, unknown> | null) => {
    const key = `${isName ? 'name' : 'base'}:${spanIndex}`
    const cached = styleCache.get(key)
    if (cached) return cached
    const resolved = resolveEffectiveRunStyle(baseStyle, isName ? nameStyle : null, spanStyle)
    styleCache.set(key, resolved)
    return resolved
  }

  const words: MixedWord[] = []
  let current: MixedWord | null = null

  const flush = () => {
    if (current && current.runs.length > 0) {
      finalizeMixedWord(ctx, current)
      words.push(current)
    }
    current = null
  }

  const ensureWord = () => {
    if (!current) current = { runs: [], isSpace: false, width: 0 }
    return current
  }

  const addRun = (raw: string, rawOffset: number, isName: boolean, isSpace: boolean) => {
    const span = spanAt(rawOffset)
    const style = resolveCachedStyle(isName, span.index, span.style)
    const transformed = applyTextTransform(raw, style.textTransform as string | undefined)
    setCanvasTextStyle(ctx, style)
    const run: MixedRun = {
      raw,
      text: transformed,
      isName,
      isSpace,
      width: ctx.measureText(transformed).width,
      style,
    }
    if (isSpace) {
      flush()
      const spaceWord: MixedWord = { runs: [run], isSpace: true, width: run.width }
      words.push(spaceWord)
      return
    }

    const word = ensureWord()
    const previous = word.runs[word.runs.length - 1]
    if (
      previous &&
      !previous.isName &&
      !isName &&
      previous.style === style &&
      !previous.isSpace
    ) {
      previous.raw += raw
      previous.text = applyTextTransform(previous.raw, previous.style.textTransform as string | undefined)
      setCanvasTextStyle(ctx, previous.style)
      previous.width = ctx.measureText(previous.text).width
    } else {
      word.runs.push(run)
    }
  }

  let index = 0
  while (index < rawContent.length) {
    if (rawContent.startsWith('{name}', index)) {
      flush()
      addRun(childName, index, true, false)
      flush()
      index += '{name}'.length
      continue
    }

    const char = rawContent[index]
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      flush()
      words.push({ runs: [], isSpace: false, isNewline: true, width: 0 })
      index += 1
      continue
    }
    if (char === ' ') {
      addRun(' ', index, false, true)
      index += 1
      continue
    }
    addRun(char, index, false, false)
    index += 1
  }
  flush()

  return words
}

function finalizeMixedWord(ctx: CanvasTextContext, word: MixedWord) {
  let width = 0
  for (const run of word.runs) {
    setCanvasTextStyle(ctx, run.style)
    run.text = applyTextTransform(run.raw, run.style.textTransform as string | undefined)
    run.width = ctx.measureText(run.text).width
    width += run.width
  }
  word.width = width
}

function packMixedWords(words: MixedWord[], maxWidth: number): MixedWord[][] {
  const lines: MixedWord[][] = [[]]
  let lineWidth = 0
  for (const word of words) {
    if (word.isNewline) {
      lines.push([])
      lineWidth = 0
      continue
    }
    if (word.isSpace && lineWidth === 0) continue
    if (!word.isSpace && lineWidth + word.width > maxWidth && lineWidth > 0) {
      lines.push([])
      lineWidth = 0
    }
    lines[lines.length - 1].push(word)
    lineWidth += word.width
  }
  return lines.length > 0 ? lines : [[]]
}

function resolveEffectiveRunStyle(
  baseStyle: ResolvedTextStyle,
  nameStyle: ResolvedTextStyle | null,
  spanStyle: Record<string, unknown> | null
): ResolvedTextStyle {
  const merged: SubtitleTemplateText = { ...baseStyle }
  const mergedRecord = merged as Record<string, unknown>
  if (nameStyle) {
    for (const key of RUN_STYLE_KEYS) {
      if (nameStyle[key] !== undefined && nameStyle[key] !== null) mergedRecord[key] = nameStyle[key]
    }
  }
  if (spanStyle) {
    for (const key of RUN_STYLE_KEYS) {
      if (spanStyle[key] !== undefined && spanStyle[key] !== null) mergedRecord[key] = spanStyle[key]
    }
  }
  return resolveTextStyle(merged)
}

function drawGlowPass(
  ctx: CanvasTextContext,
  styles: ResolvedTextStyle[],
  draw: (drawToken: (text: string, x: number, y: number) => void) => void
) {
  const style = styles.find((candidate) => candidate.glow)
  if (!style) return
  ctx.save()
  ctx.shadowColor = hexToRgba(String(style.glowColor ?? '#FFD700'), clampNumber(numberOr(style.glowOpacity, 0.85), 0, 1))
  ctx.shadowBlur = numberOr(style.glowBlur, 20)
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = String(style.glowColor ?? '#FFD700')
  setCanvasTextStyle(ctx, style)
  for (let i = 0; i < 3; i += 1) {
    draw((text, x, y) => ctx.fillText(text, x, y))
  }
  ctx.restore()
}

async function drawBevelPass(
  ctx: CanvasTextContext,
  style: ResolvedTextStyle,
  draw: (drawToken: (text: string, x: number, y: number) => void, offsetX: number, offsetY: number) => void
) {
  if (!style.bevel) return
  const depth = Math.max(1, Math.round(numberOr(style.bevelDepth, 4)))
  ctx.save()
  setCanvasTextStyle(ctx, style)
  const texturePattern = typeof style.bevelTexture === 'string' ? await loadPattern(ctx, style.bevelTexture) : null
  const inheritedAlpha = ctx.globalAlpha
  for (let i = depth; i >= 1; i -= 1) {
    const alpha = 0.08 + ((depth - i + 1) / depth) * 0.42
    if (texturePattern) {
      ctx.globalAlpha = inheritedAlpha * alpha
      ctx.fillStyle = texturePattern
    } else {
      ctx.globalAlpha = inheritedAlpha
      ctx.fillStyle = hexToRgba(String(style.bevelShadow ?? '#000000'), alpha)
    }
    draw((text, x, y) => ctx.fillText(text, x, y), i, i)
  }
  ctx.globalAlpha = inheritedAlpha
  ctx.fillStyle = hexToRgba(String(style.bevelHighlight ?? '#FFFFFF'), 0.35)
  draw((text, x, y) => ctx.fillText(text, x, y), -1, -1)
  ctx.restore()
}

function drawShadowPass(
  ctx: CanvasTextContext,
  styles: ResolvedTextStyle[],
  draw: (drawToken: (text: string, x: number, y: number) => void) => void
) {
  const style = styles.find((candidate) => candidate.shadow)
  if (!style) return
  ctx.save()
  setCanvasTextStyle(ctx, style)
  ctx.shadowColor = hexToRgba(String(style.shadowColor ?? '#000000'), clampNumber(numberOr(style.shadowOpacity, 0.5), 0, 1))
  ctx.shadowBlur = numberOr(style.shadowBlur, 8)
  ctx.shadowOffsetX = numberOr(style.shadowOffsetX, 2)
  ctx.shadowOffsetY = numberOr(style.shadowOffsetY, 4)
  ctx.fillStyle = hexToRgba(String(style.shadowColor ?? '#000000'), 1)
  draw((text, x, y) => ctx.fillText(text, x, y))
  ctx.restore()
}

function drawStrokePass(
  ctx: CanvasTextContext,
  styles: ResolvedTextStyle[],
  draw: (drawToken: (text: string, x: number, y: number) => void) => void
) {
  const style = styles.find((candidate) => candidate.stroke)
  if (!style) return
  ctx.save()
  setCanvasTextStyle(ctx, style)
  ctx.lineWidth = numberOr(style.strokeWidth, 4)
  ctx.strokeStyle = hexToRgba(String(style.strokeColor ?? '#000000'), clampNumber(numberOr(style.strokeOpacity, 1), 0, 1))
  ctx.lineJoin = 'round'
  draw((text, x, y) => ctx.strokeText(text, x, y))
  ctx.restore()
}

async function drawFillPass(
  ctx: CanvasTextContext,
  style: ResolvedTextStyle,
  region: { x: number; y: number; width: number; height: number },
  draw: (drawToken: (text: string, x: number, y: number) => void) => void
) {
  setCanvasTextStyle(ctx, style)
  if (style.fill.type === 'texture') {
    const texture = typeof style.fill.image === 'string' ? await loadImageSafe(style.fill.image) : null
    if (!texture) {
      ctx.fillStyle = '#FFFFFF'
      draw((text, x, y) => ctx.fillText(text, x, y))
      return
    }
    const offscreen = createCanvas(Math.max(1, Math.ceil(region.width)), Math.max(1, Math.ceil(region.height)))
    const offCtx = offscreen.getContext('2d')
    setCanvasTextStyle(offCtx, style)
    offCtx.textAlign = ctx.textAlign
    offCtx.textBaseline = 'alphabetic'
    offCtx.fillStyle = '#FFFFFF'
    draw((text, x, y) => offCtx.fillText(text, x - region.x, y - region.y))
    offCtx.globalCompositeOperation = 'source-in'
    offCtx.drawImage(texture, 0, 0, offscreen.width, offscreen.height)
    ctx.drawImage(offscreen, region.x, region.y)
    return
  }
  ctx.fillStyle = createFillStyle(ctx, style.fill, region)
  draw((text, x, y) => ctx.fillText(text, x, y))
}

function wrapTextCanvas(ctx: CanvasTextContext, text: string, maxWidth: number): TextLine[] {
  const lines: TextLine[] = []
  for (const paragraph of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push({ text: line, width: ctx.measureText(line).width })
        line = word
      } else {
        line = test
      }
    }
    lines.push({ text: line, width: ctx.measureText(line).width })
  }
  return lines.length > 0 ? lines : [{ text: '', width: 0 }]
}

function resolveTextStyle(item: SubtitleTemplateText): ResolvedTextStyle {
  const size = Math.max(MIN_FONT_SIZE, numberOr(item.size, 24))
  const fontWeight = Math.round(clampNumber(numberOr(item.fontWeight, item.bold ? 700 : 400), 100, 900))
  return {
    ...item,
    font: typeof item.font === 'string' && item.font.trim() ? item.font : "'Lora', serif",
    size,
    fontWeight,
    bold: item.bold === true,
    italic: item.italic === true,
    letterSpacing: numberOr(item.letterSpacing, 0),
    lineHeight: numberOr(item.lineHeight, 1.2),
    fill: resolveFillDescriptor(item),
  }
}

function resolveEffectiveNameStyle(item: SubtitleTemplateText, baseStyle: ResolvedTextStyle): ResolvedTextStyle | null {
  const nameStyle = item.nameStyle
  if (!nameStyle || nameStyle.enabled !== true) return null
  const allowedKeys = [
    'font',
    'size',
    'bold',
    'italic',
    'letterSpacing',
    'textTransform',
    'textureImage',
    'fill',
    'color',
    'customColor',
    'customGradientStart',
    'customGradientEnd',
    'customGradientAngle',
    'shadow',
    'shadowColor',
    'shadowOpacity',
    'shadowBlur',
    'shadowOffsetX',
    'shadowOffsetY',
    'stroke',
    'strokeWidth',
    'strokeColor',
    'strokeOpacity',
    'bevel',
    'bevelDepth',
    'bevelHighlight',
    'bevelShadow',
    'glow',
    'glowColor',
    'glowBlur',
    'glowOpacity',
  ]
  const merged: SubtitleTemplateText = { ...baseStyle }
  for (const key of allowedKeys) {
    if (nameStyle[key] !== undefined && nameStyle[key] !== null) {
      merged[key] = nameStyle[key]
    }
  }
  return resolveTextStyle(merged)
}

function resolveFillDescriptor(item: SubtitleTemplateText): SubtitleFill {
  if (item.fill && typeof item.fill === 'object') return item.fill
  const textureImage = item.textureImage
  if (typeof textureImage === 'string' && textureImage.trim()) {
    return { type: 'texture', image: textureImage }
  }
  const color = typeof item.color === 'string' ? item.color : '#FFFFFF'
  if (color === 'custom_gradient') {
    return {
      type: 'linearGradient',
      angle: numberOr(item.customGradientAngle, 180),
      stops: [
        { offset: 0, color: String(item.customGradientStart ?? '#FF8C00') },
        { offset: 1, color: String(item.customGradientEnd ?? '#FFD700') },
      ],
    }
  }
  const presetStops = PRESET_GRADIENT_STOPS[color]
  if (presetStops) {
    return {
      type: 'linearGradient',
      angle: 180,
      stops: [
        { offset: 0, color: presetStops[0] },
        { offset: 0.28, color: presetStops[1] },
        { offset: 0.52, color: presetStops[2] },
        { offset: 1, color: presetStops[3] },
      ],
    }
  }
  return { type: 'solid', color: color === 'custom' ? String(item.customColor ?? '#FFFFFF') : color }
}

function createFillStyle(
  ctx: CanvasTextContext,
  fill: SubtitleFill,
  region: { x: number; y: number; width: number; height: number }
): string | CanvasGradient {
  if (fill.type === 'linearGradient') {
    const angle = numberOr(fill.angle, 180)
    const rad = (angle * Math.PI) / 180
    const dx = Math.sin(rad)
    const dy = -Math.cos(rad)
    const cx = region.x + region.width / 2
    const cy = region.y + region.height / 2
    const halfLen = (Math.abs(dx) * region.width + Math.abs(dy) * region.height) / 2 || region.height / 2
    const gradient = ctx.createLinearGradient(
      cx - dx * halfLen,
      cy - dy * halfLen,
      cx + dx * halfLen,
      cy + dy * halfLen
    )
    const stops = Array.isArray(fill.stops) && fill.stops.length > 0 ? fill.stops : [{ offset: 0, color: '#FFFFFF' }]
    for (const stop of stops) {
      gradient.addColorStop(clampNumber(numberOr(stop.offset, 0), 0, 1), String(stop.color ?? '#FFFFFF'))
    }
    return gradient
  }
  return fill.type === 'texture' ? '#FFFFFF' : String(fill.color ?? '#FFFFFF')
}

function setCanvasTextStyle(ctx: CanvasTextContext, style: ResolvedTextStyle) {
  ctx.font = buildCanvasFont(style.font, style.size, style.fontWeight, style.italic)
  ctx.letterSpacing = `${style.letterSpacing}px`
}

function resolvePadding(item: SubtitleTemplateText): Padding {
  return {
    top: Math.max(0, numberOr(item.boxPaddingTop ?? item.boxPaddingY, 0)),
    right: Math.max(0, numberOr(item.boxPaddingRight ?? item.boxPaddingX, 0)),
    bottom: Math.max(0, numberOr(item.boxPaddingBottom ?? item.boxPaddingY, 0)),
    left: Math.max(0, numberOr(item.boxPaddingLeft ?? item.boxPaddingX, 0)),
  }
}

function resolveVerticalOffset(
  verticalAlign: string | undefined,
  boxHeight: number,
  pad: Padding,
  lineCount: number,
  lineHeight: number
): number {
  const paddedHeight = Math.max(0, boxHeight - pad.top - pad.bottom)
  const textHeight = lineCount * lineHeight
  if (verticalAlign === 'middle') return Math.max(0, (paddedHeight - textHeight) / 2)
  if (verticalAlign === 'bottom') return Math.max(0, paddedHeight - textHeight)
  return 0
}

function resolveAnchorX(
  align: 'left' | 'center' | 'right',
  bx: number,
  bw: number,
  pad: Padding,
  availW: number
): number {
  if (align === 'center') return bx + pad.left + availW / 2
  if (align === 'right') return bx + bw - pad.right
  return bx + pad.left
}

async function loadImageSafe(source: string) {
  try {
    return await loadImage(source)
  } catch {
    return null
  }
}

async function loadPattern(ctx: CanvasTextContext, source: string) {
  const image = await loadImageSafe(source)
  if (!image) return null
  return ctx.createPattern(image, 'repeat')
}

function drawUnderline(
  ctx: CanvasTextContext,
  text: string,
  anchorX: number,
  baselineY: number,
  style: ResolvedTextStyle,
  align: 'left' | 'center' | 'right'
) {
  const width = ctx.measureText(text).width
  const startX = align === 'center' ? anchorX - width / 2 : align === 'right' ? anchorX - width : anchorX
  ctx.save()
  ctx.strokeStyle = createFillStyle(ctx, style.fill, {
    x: startX,
    y: baselineY - style.size,
    width: Math.max(1, width),
    height: style.size,
  })
  ctx.lineWidth = Math.max(1, style.size / 16)
  ctx.beginPath()
  ctx.moveTo(startX, baselineY + style.size * 0.12)
  ctx.lineTo(startX + width, baselineY + style.size * 0.12)
  ctx.stroke()
  ctx.restore()
}

function clearShadow(ctx: CanvasTextContext) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

function beginRoundRect(ctx: CanvasTextContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  if (radius > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius)
    return
  }
  if (radius <= 0) {
    ctx.rect(x, y, width, height)
    return
  }
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function applyTextTransform(content: string, textTransform: string | undefined): string {
  if (!content) return content
  switch ((textTransform ?? 'none').toLowerCase()) {
    case 'uppercase':
      return content.toUpperCase()
    case 'lowercase':
      return content.toLowerCase()
    case 'capitalize':
      return content.replace(/\b\w/g, (char) => char.toUpperCase())
    default:
      return content
  }
}

function buildCanvasFont(
  fontFamily: string | undefined,
  size: number,
  fontWeight: number | undefined,
  italic: boolean | undefined
): string {
  const resolvedFamily = resolveFontFamily(fontFamily)
  const resolvedWeight = Math.round(clampNumber(numberOr(fontWeight, 400), 100, 900))
  const parts = [italic ? 'italic' : 'normal', String(resolvedWeight), `${Math.max(size, MIN_FONT_SIZE)}px`, resolvedFamily]
  return parts.join(' ')
}

function resolveFontFamily(fontFamily: string | undefined): string {
  if (!fontFamily || !fontFamily.trim()) return 'sans-serif'

  const candidates = fontFamily
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  for (const candidate of candidates) {
    if (registeredFontAliases.has(candidate.toLowerCase())) {
      return `"${candidate}"`
    }
  }

  return fontFamily
}

function deriveFontAliases(fileName: string): string[] {
  const baseName = path.basename(fileName, path.extname(fileName)).trim()
  if (!baseName) return []

  const aliases = new Set<string>()
  aliases.add(baseName)

  const normalized = baseName.replace(/[_\s]+/g, '-')
  const familyOnly = normalized.split('-')[0]?.trim()
  if (familyOnly) aliases.add(familyOnly)

  const match = normalized.match(/^(.+?)-(normal|italic|oblique|regular|medium|semibold|bold|black|thin|light|extrabold)(-|$)/i)
  if (match?.[1]?.trim()) {
    aliases.add(match[1].trim())
  }

  return Array.from(aliases).filter(Boolean)
}

function registerFontAssets(fontAssets: SubtitleFontAsset[]) {
  for (const asset of fontAssets) {
    const aliases = deriveFontAliases(asset.fileName)
    for (const alias of aliases) {
      const aliasKey = alias.toLowerCase()
      if (registeredFontAliases.has(aliasKey)) continue
      const registered = GlobalFonts.register(asset.buffer, alias)
      if (registered) {
        registeredFontAliases.add(aliasKey)
      }
    }
  }
}

function stripJsonComments(input: string): string {
  input = input.replace(/^\uFEFF/, '')
  let output = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]

    if (!inString && char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1
      output += '\n'
      continue
    }

    if (!inString && char === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 1
      continue
    }

    if (char === '"' && !escaped) {
      inString = !inString
    }

    escaped = char === '\\' && !escaped
    output += char
  }

  return output
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1')
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (!(normalized.length === 3 || normalized.length === 6)) {
    return `rgba(0, 0, 0, ${alpha})`
  }

  const full = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized
  const red = Number.parseInt(full.slice(0, 2), 16)
  const green = Number.parseInt(full.slice(2, 4), 16)
  const blue = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeTextAlign(value: string | undefined): 'left' | 'center' | 'right' {
  if (value === 'center' || value === 'right') return value
  return 'left'
}
