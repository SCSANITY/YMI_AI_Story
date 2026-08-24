'use client'

import { useEffect, useRef } from 'react'
import {
  Bold,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Underline,
} from 'lucide-react'
import type {
  GeneralMailContentBlock,
  GeneralMailDocument,
  GeneralMailInline,
  GeneralMailTextMark,
} from '@/lib/general-mail-content'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineHtml(inline: GeneralMailInline) {
  let value = escapeHtml(inline.text).replace(/\n/g, '<br>')
  for (const mark of inline.marks ?? []) {
    if (mark === 'bold') value = `<strong>${value}</strong>`
    if (mark === 'italic') value = `<em>${value}</em>`
    if (mark === 'underline') value = `<u>${value}</u>`
  }
  if (inline.href) value = `<a href="${escapeHtml(inline.href)}">${value}</a>`
  return value
}

function documentHtml(document: GeneralMailDocument) {
  return document.blocks.map((block) => {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const tag = block.type === 'orderedList' ? 'ol' : 'ul'
      return `<${tag}>${block.items.map((item) => `<li>${item.map(inlineHtml).join('')}</li>`).join('')}</${tag}>`
    }
    const tag = block.type === 'heading' ? 'h2' : block.type === 'quote' ? 'blockquote' : 'p'
    const content = (block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content
    return `<${tag}>${content.map(inlineHtml).join('') || '<br>'}</${tag}>`
  }).join('')
}

function marksEqual(left?: GeneralMailTextMark[], right?: GeneralMailTextMark[]) {
  return (left ?? []).join(',') === (right ?? []).join(',')
}

function pushInline(target: GeneralMailInline[], inline: GeneralMailInline) {
  if (!inline.text) return
  const previous = target[target.length - 1]
  if (previous && previous.href === inline.href && marksEqual(previous.marks, inline.marks)) {
    previous.text += inline.text
    return
  }
  target.push(inline)
}

function readInlineNodes(node: Node, inherited: { marks: GeneralMailTextMark[]; href?: string }, output: GeneralMailInline[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    pushInline(output, {
      text: node.textContent ?? '',
      ...(inherited.marks.length ? { marks: inherited.marks } : {}),
      ...(inherited.href ? { href: inherited.href } : {}),
    })
    return
  }
  if (!(node instanceof HTMLElement)) return
  if (node.tagName === 'BR') {
    pushInline(output, {
      text: '\n',
      ...(inherited.marks.length ? { marks: inherited.marks } : {}),
      ...(inherited.href ? { href: inherited.href } : {}),
    })
    return
  }
  const marks = [...inherited.marks]
  if (['STRONG', 'B'].includes(node.tagName) && !marks.includes('bold')) marks.push('bold')
  if (['EM', 'I'].includes(node.tagName) && !marks.includes('italic')) marks.push('italic')
  if (node.tagName === 'U' && !marks.includes('underline')) marks.push('underline')
  const rawHref = node.tagName === 'A' ? node.getAttribute('href') : inherited.href
  let href: string | undefined
  if (rawHref) {
    try {
      const parsed = new URL(rawHref)
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
        href = parsed.toString()
      }
    } catch {
      href = undefined
    }
  }
  node.childNodes.forEach((child) => readInlineNodes(child, { marks, href }, output))
}

function readInlineContainer(node: Element) {
  const output: GeneralMailInline[] = []
  node.childNodes.forEach((child) => readInlineNodes(child, { marks: [] }, output))
  return output
}

function editorDocument(root: HTMLElement): GeneralMailDocument {
  const blocks: GeneralMailContentBlock[] = []
  for (const child of Array.from(root.children)) {
    const tag = child.tagName
    if (tag === 'UL' || tag === 'OL') {
      blocks.push({
        type: tag === 'OL' ? 'orderedList' : 'bulletList',
        items: Array.from(child.children)
          .filter((item) => item.tagName === 'LI')
          .map(readInlineContainer),
      })
      continue
    }
    blocks.push({
      type: tag === 'H2' ? 'heading' : tag === 'BLOCKQUOTE' ? 'quote' : 'paragraph',
      content: readInlineContainer(child),
    })
  }
  if (blocks.length === 0 && root.textContent) {
    blocks.push({ type: 'paragraph', content: [{ text: root.textContent }] })
  }
  return { version: 1, blocks }
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--admin-page-muted)] transition hover:bg-[color-mix(in_srgb,var(--admin-page-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent-dp)]"
    >
      {children}
    </button>
  )
}

export function GeneralMailRichEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: GeneralMailDocument
  onChange: (document: GeneralMailDocument) => void
  disabled?: boolean
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef('')

  useEffect(() => {
    const serialized = JSON.stringify(value)
    if (!editorRef.current || serialized === lastEmittedRef.current) return
    editorRef.current.innerHTML = documentHtml(value)
  }, [value])

  const emit = () => {
    if (!editorRef.current) return
    const next = editorDocument(editorRef.current)
    lastEmittedRef.current = JSON.stringify(next)
    onChange(next)
  }
  const command = (name: string, argument?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    emit()
  }
  const addLink = () => {
    const href = window.prompt('Link URL (https://...)')?.trim()
    if (!href) return
    try {
      const parsed = new URL(href)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return
      command('createLink', parsed.toString())
    } catch {
      return
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)]">
      <div className="flex flex-wrap gap-0.5 border-b border-[var(--admin-line)] px-2 py-1">
        <ToolbarButton label="Bold" onClick={() => command('bold')}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => command('italic')}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => command('underline')}><Underline className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 w-px bg-[var(--admin-line)]" />
        <ToolbarButton label="Heading" onClick={() => command('formatBlock', 'h2')}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Quote" onClick={() => command('formatBlock', 'blockquote')}><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Bulleted list" onClick={() => command('insertUnorderedList')}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => command('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Link" onClick={addLink}><LinkIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Clear formatting" onClick={() => command('removeFormat')}><RemoveFormatting className="h-4 w-4" /></ToolbarButton>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        className="general-mail-rich-editor min-h-48 px-4 py-3 text-sm leading-6 text-[var(--admin-page-ink)] outline-none"
      />
    </div>
  )
}

function InlineView({ inline }: { inline: GeneralMailInline }) {
  let content: React.ReactNode = inline.text
  for (const mark of inline.marks ?? []) {
    if (mark === 'bold') content = <strong>{content}</strong>
    if (mark === 'italic') content = <em>{content}</em>
    if (mark === 'underline') content = <u>{content}</u>
  }
  return inline.href
    ? <a href={inline.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">{content}</a>
    : <>{content}</>
}

function InlineList({ values }: { values: GeneralMailInline[] }) {
  return <>{values.map((inline, index) => <InlineView key={index} inline={inline} />)}</>
}

export function GeneralMailDocumentView({ document }: { document: GeneralMailDocument }) {
  return (
    <div className="space-y-3 break-words text-sm leading-6 text-[var(--admin-page-ink)]">
      {document.blocks.map((block, index) => {
        if (block.type === 'heading') return <h3 key={index} className="text-lg font-bold"><InlineList values={(block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content} /></h3>
        if (block.type === 'quote') return <blockquote key={index} className="border-l-2 border-[var(--admin-accent)] pl-3 text-[var(--admin-page-muted)]"><InlineList values={(block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content} /></blockquote>
        if (block.type === 'bulletList') return <ul key={index} className="list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineList values={item} /></li>)}</ul>
        if (block.type === 'orderedList') return <ol key={index} className="list-decimal space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineList values={item} /></li>)}</ol>
        return <p key={index} className="whitespace-pre-wrap"><InlineList values={(block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content} /></p>
      })}
    </div>
  )
}
