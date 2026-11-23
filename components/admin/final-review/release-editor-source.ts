import { actionBase } from '@/lib/release-mail-body'
import type { GeneralMailDocument, GeneralMailInline } from '@/lib/general-mail-content'

// Read the actual rendered edition template. Ignore presentation tables and
// artwork, preserving paragraphs, list structure, emphasis and book actions.
export function releaseEditorSource(html: string) {
  const root = new DOMParser().parseFromString(html,'text/html').querySelector('[data-release-body]')
  if (!root) throw new Error('Email template body unavailable')
  const blocks: GeneralMailDocument['blocks'] = []
  function inline(node: Node, style: Omit<GeneralMailInline,'text'> = {}): GeneralMailInline[] {
    if (node.nodeType === Node.TEXT_NODE) return [{text:node.textContent ?? '', ...style}]
    if (!(node instanceof Element)) return []
    const tag = node.tagName
    if (tag === 'BR') return [{text:'\n',...style}]
    const mark = tag === 'B' || tag === 'STRONG' ? 'bold' : tag === 'I' || tag === 'EM' ? 'italic' : null
    const href = node.getAttribute('href')
    const next = { ...style, ...(mark ? {marks:[...new Set([...(style.marks ?? []),mark])] as GeneralMailInline['marks']} : {}),
      ...(tag === 'A' && href?.startsWith('#') ? {href:actionBase+href.slice(1)} : {}) }
    return Array.from(node.childNodes).flatMap(child=>inline(child,next))
  }
  function visit(node: Element) {
    if (node.matches('ul,ol')) {
      blocks.push({type:node.tagName==='OL'?'orderedList':'bulletList',items:Array.from(node.children).map(li=>inline(li))})
    } else if (node.matches('p,h1,h2,h3,a')) {
      blocks.push({type:node.tagName.startsWith('H')?'heading':'paragraph',content:inline(node)})
    } else Array.from(node.children).forEach(visit)
  }
  visit(root)
  return { version:1,blocks } as GeneralMailDocument
}
