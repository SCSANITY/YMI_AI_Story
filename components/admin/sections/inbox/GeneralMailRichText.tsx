'use client'

import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ListItem } from '@tiptap/extension-list'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Check,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
  Unlink,
  X,
} from 'lucide-react'
import type {
  GeneralMailContentBlock,
  GeneralMailDocument,
  GeneralMailInline,
  GeneralMailTextMark,
} from '@/lib/general-mail-content'

const FlatListItem = ListItem.extend({
  content: 'paragraph+',
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => true,
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    }
  },
})

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    listItem: false,
    heading: { levels: [2] },
    link: {
      autolink: false,
      linkOnPaste: false,
      openOnClick: false,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  FlatListItem,
]

function marksEqual(left?: GeneralMailTextMark[], right?: GeneralMailTextMark[]) {
  return (left ?? []).join(',') === (right ?? []).join(',')
}

function appendInline(target: GeneralMailInline[], inline: GeneralMailInline) {
  if (!inline.text) return
  const previous = target[target.length - 1]
  if (previous && previous.href === inline.href && marksEqual(previous.marks, inline.marks)) {
    previous.text += inline.text
    return
  }
  target.push(inline)
}

function safeHref(value: unknown) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function tiptapInlineContent(content: JSONContent[] | undefined) {
  const output: GeneralMailInline[] = []
  for (const node of content ?? []) {
    if (node.type === 'hardBreak') {
      appendInline(output, { text: '\n' })
      continue
    }
    if (node.type !== 'text' || typeof node.text !== 'string') continue
    const marks: GeneralMailTextMark[] = []
    let href: string | undefined
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold' && !marks.includes('bold')) marks.push('bold')
      if (mark.type === 'italic' && !marks.includes('italic')) marks.push('italic')
      if (mark.type === 'underline' && !marks.includes('underline')) marks.push('underline')
      if (mark.type === 'link') href = safeHref(mark.attrs?.href)
    }
    appendInline(output, {
      text: node.text,
      ...(marks.length ? { marks } : {}),
      ...(href ? { href } : {}),
    })
  }
  return output
}

function listItemInlineContent(item: JSONContent) {
  const output: GeneralMailInline[] = []
  const blocks = item.content ?? []
  blocks.forEach((block, index) => {
    if (block.type !== 'paragraph') {
      throw new Error('Nested list content is not supported')
    }
    if (index > 0 && output.length) appendInline(output, { text: '\n' })
    for (const inline of tiptapInlineContent(block.content)) appendInline(output, inline)
  })
  return output
}

export function tiptapJsonToGeneralMailDocument(root: JSONContent): GeneralMailDocument {
  const blocks: GeneralMailContentBlock[] = []
  for (const node of root.content ?? []) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      blocks.push({
        type: node.type,
        items: (node.content ?? [])
          .filter((item) => item.type === 'listItem')
          .map(listItemInlineContent),
      })
      continue
    }
    if (node.type === 'blockquote') {
      const content: GeneralMailInline[] = []
      ;(node.content ?? []).forEach((child, index) => {
        if (index > 0 && content.length) appendInline(content, { text: '\n' })
        for (const inline of tiptapInlineContent(child.content)) appendInline(content, inline)
      })
      blocks.push({ type: 'quote', content })
      continue
    }
    if (node.type === 'heading' || node.type === 'paragraph') {
      blocks.push({
        type: node.type === 'heading' ? 'heading' : 'paragraph',
        content: tiptapInlineContent(node.content),
      })
    }
  }
  return {
    version: 1,
    blocks: blocks.length ? blocks : [{ type: 'paragraph', content: [] }],
  }
}

function tiptapMarks(inline: GeneralMailInline) {
  const marks: NonNullable<JSONContent['marks']> = []
  for (const mark of inline.marks ?? []) marks.push({ type: mark })
  if (inline.href) marks.push({ type: 'link', attrs: { href: inline.href } })
  return marks.length ? marks : undefined
}

function generalInlineToTiptap(inline: GeneralMailInline) {
  const output: JSONContent[] = []
  const parts = inline.text.split('\n')
  parts.forEach((part, index) => {
    if (part) output.push({ type: 'text', text: part, marks: tiptapMarks(inline) })
    if (index < parts.length - 1) output.push({ type: 'hardBreak' })
  })
  return output
}

function generalInlineListToTiptap(content: GeneralMailInline[]) {
  return content.flatMap(generalInlineToTiptap)
}

export function generalMailDocumentToTiptapJson(document: GeneralMailDocument): JSONContent {
  const content = document.blocks.map((block): JSONContent => {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      return {
        type: block.type,
        content: block.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: generalInlineListToTiptap(item) }],
        })),
      }
    }
    if (block.type === 'quote') {
      return {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: generalInlineListToTiptap(block.content) }],
      }
    }
    const inlineBlock = block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>
    return {
      type: block.type === 'heading' ? 'heading' : 'paragraph',
      ...(block.type === 'heading' ? { attrs: { level: 2 } } : {}),
      content: generalInlineListToTiptap(inlineBlock.content),
    }
  })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function ToolbarButton({
  label,
  onClick,
  pressed = false,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent-dp)] disabled:cursor-not-allowed disabled:opacity-35 lg:h-9 lg:w-9 ${pressed
        ? 'bg-[color-mix(in_srgb,var(--admin-accent)_20%,var(--admin-card))] text-[var(--admin-page-ink)]'
        : 'text-[var(--admin-page-muted)] hover:bg-[color-mix(in_srgb,var(--admin-page-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)]'}`}
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
  const onChangeRef = useRef(onChange)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: generalMailDocumentToTiptapJson(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'general-mail-rich-editor min-h-48 flex-1 overflow-y-auto px-4 py-3 text-sm leading-6 text-[var(--admin-page-ink)] outline-none [&_a]:text-[var(--admin-accent-dp)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--admin-accent)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--admin-page-muted)] [&_h2]:text-lg [&_h2]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:min-h-[1.5em] [&_ul]:list-disc [&_ul]:pl-5',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(tiptapJsonToGeneralMailDocument(currentEditor.getJSON()))
    },
  })

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
      heading: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      quote: currentEditor?.isActive('blockquote') ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      link: currentEditor?.isActive('link') ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
    }),
  })

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(tiptapJsonToGeneralMailDocument(editor.getJSON()))
    const incoming = JSON.stringify(value)
    if (current !== incoming) {
      editor.commands.setContent(generalMailDocumentToTiptapJson(value), { emitUpdate: false })
    }
  }, [editor, value])

  const openLinkEditor = () => {
    if (!editor) return
    setLinkValue(String(editor.getAttributes('link').href ?? ''))
    setLinkOpen(true)
  }

  const applyLink = () => {
    if (!editor) return
    const href = safeHref(linkValue.trim())
    if (!href) return
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
  }

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkOpen(false)
    setLinkValue('')
  }

  const unavailable = disabled || !editor

  return (
    <div className="flex min-h-[20rem] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)]">
      <div className="flex shrink-0 flex-wrap gap-0.5 border-b border-[var(--admin-line)] px-2 py-1">
        <ToolbarButton label="Undo" disabled={unavailable || !toolbar?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={unavailable || !toolbar?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 w-px bg-[var(--admin-line)]" />
        <ToolbarButton label="Bold" disabled={unavailable} pressed={toolbar?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Italic" disabled={unavailable} pressed={toolbar?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Underline" disabled={unavailable} pressed={toolbar?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 w-px bg-[var(--admin-line)]" />
        <ToolbarButton label="Heading" disabled={unavailable} pressed={toolbar?.heading} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Quote" disabled={unavailable} pressed={toolbar?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Bulleted list" disabled={unavailable} pressed={toolbar?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Numbered list" disabled={unavailable} pressed={toolbar?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Insert link" disabled={unavailable} pressed={toolbar?.link} onClick={openLinkEditor}><LinkIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Clear formatting" disabled={unavailable} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="h-4 w-4" /></ToolbarButton>
      </div>
      {linkOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--admin-line)] px-3 py-2">
          <LinkIcon className="h-4 w-4 shrink-0 text-[var(--admin-page-muted)]" />
          <input
            type="url"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); applyLink() }
              if (event.key === 'Escape') setLinkOpen(false)
            }}
            autoFocus
            placeholder="https://example.com"
            aria-label="Link URL"
            className="min-h-10 min-w-0 flex-1 rounded-md border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3 text-sm text-[var(--admin-page-ink)] outline-none focus:border-[var(--admin-accent-dp)]"
          />
          <button type="button" onClick={applyLink} disabled={!safeHref(linkValue.trim())} aria-label="Apply link" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--admin-accent-dp)] hover:bg-[color-mix(in_srgb,var(--admin-accent)_16%,transparent)] disabled:opacity-35 lg:h-9 lg:w-9"><Check className="h-4 w-4" /></button>
          {toolbar?.link ? <button type="button" onClick={removeLink} aria-label="Remove link" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--admin-page-muted)] hover:bg-[color-mix(in_srgb,var(--admin-page-ink)_8%,transparent)] lg:h-9 lg:w-9"><Unlink className="h-4 w-4" /></button> : null}
          <button type="button" onClick={() => setLinkOpen(false)} aria-label="Cancel link" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--admin-page-muted)] hover:bg-[color-mix(in_srgb,var(--admin-page-ink)_8%,transparent)] lg:h-9 lg:w-9"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
      <EditorContent editor={editor} className="flex min-h-0 flex-1 flex-col" />
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
