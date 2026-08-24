const MAX_BLOCKS = 200
const MAX_INLINE_NODES = 2000
const MAX_TEXT_LENGTH = 50000
const MAX_HTML_LENGTH = 100000
const MAX_DOCUMENT_LENGTH = 100000
const MAX_LINK_LENGTH = 2048

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'quote', 'bulletList', 'orderedList'])
const MARK_TYPES = new Set(['bold', 'italic', 'underline'])

export type GeneralMailTextMark = 'bold' | 'italic' | 'underline'

export type GeneralMailInline = {
  text: string
  marks?: GeneralMailTextMark[]
  href?: string
}

export type GeneralMailContentBlock =
  | {
      type: 'paragraph' | 'heading' | 'quote'
      content: GeneralMailInline[]
    }
  | {
      type: 'bulletList' | 'orderedList'
      items: GeneralMailInline[][]
    }

export type GeneralMailDocument = {
  version: 1
  blocks: GeneralMailContentBlock[]
}

export type NormalizedGeneralMailContent = {
  document: GeneralMailDocument
  bodyText: string
  bodyHtml: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const allowedKeys = new Set(allowed)
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(label + ' contains unsupported fields')
  }
}

function normalizeHref(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > MAX_LINK_LENGTH) {
    throw new Error('Rich text contains an invalid link')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Rich text links must use an absolute HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Rich text links must use a safe HTTP or HTTPS URL')
  }
  return url.toString()
}

function normalizeInline(value: unknown): GeneralMailInline {
  if (!isRecord(value)) throw new Error('Rich text contains an invalid inline node')
  assertExactKeys(value, ['text', 'marks', 'href'], 'Rich text inline node')
  if (typeof value.text !== 'string') throw new Error('Rich text inline text is required')
  const marks = value.marks === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(value.marks)) throw new Error('Rich text marks must be an array')
        const normalized = Array.from(new Set(value.marks.map((mark) => String(mark))))
        if (normalized.some((mark) => !MARK_TYPES.has(mark))) {
          throw new Error('Rich text contains an unsupported mark')
        }
        return normalized as GeneralMailTextMark[]
      })()
  const href = normalizeHref(value.href)
  return {
    text: value.text.replace(/\r\n?/g, '\n'),
    ...(marks?.length ? { marks } : {}),
    ...(href ? { href } : {}),
  }
}

function normalizeInlineList(value: unknown, counter: { value: number }) {
  if (!Array.isArray(value)) throw new Error('Rich text content must be an array')
  counter.value += value.length
  if (counter.value > MAX_INLINE_NODES) throw new Error('Rich text has too many inline nodes')
  return value.map(normalizeInline)
}

export function createPlainGeneralMailDocument(value: unknown): GeneralMailDocument {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT_LENGTH)
  const paragraphs = text.split(/\n{2,}/)
  return {
    version: 1,
    blocks: paragraphs.map((paragraph) => ({
      type: 'paragraph' as const,
      content: [{ text: paragraph }],
    })),
  }
}

export function normalizeGeneralMailDocument(value: unknown): GeneralMailDocument {
  if (!isRecord(value)) throw new Error('Rich text document is required')
  assertExactKeys(value, ['version', 'blocks'], 'Rich text document')
  if (value.version !== 1 || !Array.isArray(value.blocks)) {
    throw new Error('Unsupported rich text document version')
  }
  if (value.blocks.length > MAX_BLOCKS) throw new Error('Rich text has too many blocks')

  const inlineCounter = { value: 0 }
  const blocks = value.blocks.map((candidate): GeneralMailContentBlock => {
    if (!isRecord(candidate) || typeof candidate.type !== 'string' || !BLOCK_TYPES.has(candidate.type)) {
      throw new Error('Rich text contains an unsupported block')
    }
    if (candidate.type === 'bulletList' || candidate.type === 'orderedList') {
      assertExactKeys(candidate, ['type', 'items'], 'Rich text list')
      if (!Array.isArray(candidate.items) || candidate.items.length > MAX_BLOCKS) {
        throw new Error('Rich text list is invalid')
      }
      return {
        type: candidate.type,
        items: candidate.items.map((item) => normalizeInlineList(item, inlineCounter)),
      }
    }
    assertExactKeys(candidate, ['type', 'content'], 'Rich text block')
    return {
      type: candidate.type as 'paragraph' | 'heading' | 'quote',
      content: normalizeInlineList(candidate.content, inlineCounter),
    }
  })

  const document: GeneralMailDocument = { version: 1, blocks }
  if (JSON.stringify(document).length > MAX_DOCUMENT_LENGTH) {
    throw new Error('Rich text document is too large')
  }
  return document
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineHtml(inline: GeneralMailInline) {
  let value = escapeHtml(inline.text).replace(/\n/g, '<br>')
  for (const mark of inline.marks ?? []) {
    if (mark === 'bold') value = '<strong>' + value + '</strong>'
    if (mark === 'italic') value = '<em>' + value + '</em>'
    if (mark === 'underline') value = '<u>' + value + '</u>'
  }
  if (inline.href) {
    value = '<a href="' + escapeHtml(inline.href) + '" rel="noopener noreferrer nofollow">' + value + '</a>'
  }
  return value
}

function renderInlineText(content: GeneralMailInline[]) {
  return content.map((inline) => inline.text).join('')
}

export function renderGeneralMailDocument(document: GeneralMailDocument): NormalizedGeneralMailContent {
  const bodyText = document.blocks
    .map((block) => {
      if (block.type === 'bulletList' || block.type === 'orderedList') {
        return block.items
          .map((item, index) => (block.type === 'orderedList' ? String(index + 1) + '.' : '-') + ' ' + renderInlineText(item))
          .join('\n')
      }
      return renderInlineText((block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content)
    })
    .join('\n\n')
    .trim()

  if (bodyText.length > MAX_TEXT_LENGTH) throw new Error('Rich text content is too long')

  const bodyHtml = document.blocks
    .map((block) => {
      if (block.type === 'bulletList' || block.type === 'orderedList') {
        const tag = block.type === 'orderedList' ? 'ol' : 'ul'
        return '<' + tag + '>' + block.items.map((item) => '<li>' + item.map(renderInlineHtml).join('') + '</li>').join('') + '</' + tag + '>'
      }
      const tag = block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p'
      const content = (block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content
      return '<' + tag + '>' + content.map(renderInlineHtml).join('') + '</' + tag + '>'
    })
    .join('')

  if (bodyHtml.length > MAX_HTML_LENGTH) throw new Error('Rendered rich text is too large')
  return { document, bodyText, bodyHtml }
}

export function normalizeGeneralMailContent(params: {
  bodyDocument?: unknown
  bodyText?: unknown
}): NormalizedGeneralMailContent {
  const document = params.bodyDocument === undefined
    ? createPlainGeneralMailDocument(params.bodyText)
    : normalizeGeneralMailDocument(params.bodyDocument)
  return renderGeneralMailDocument(document)
}
