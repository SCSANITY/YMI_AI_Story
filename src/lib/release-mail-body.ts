import { normalizeGeneralMailDocument, type GeneralMailDocument } from '@/lib/general-mail-content'

export const releaseBodyPrefix = 'YMI-RELEASE-BODY/1\n'
export const actionBase = 'https://release-action.invalid/'
export type ReleaseAction = 'pdf' | 'order' | 'upgrade' | 'materials' | 'privacy'
export type ReleaseLinks = Partial<Record<ReleaseAction,string | undefined>>
const actions: ReleaseAction[] = ['pdf','order','upgrade','materials','privacy']

export function originalBodyFingerprint(note:string|undefined) {
  return note?.startsWith(releaseBodyPrefix) ? /^default:([a-f0-9]{64})\n/.exec(note.slice(releaseBodyPrefix.length))?.[1] : undefined
}

export function readReleaseBody(note: string | undefined, kind: 'pdf' | 'print') {
  if (!note?.startsWith(releaseBodyPrefix)) return null
  if (note.length > 64000) throw new Error('Email body is too long')
  const document = normalizeGeneralMailDocument(JSON.parse(note.slice(releaseBodyPrefix.length).replace(/^default:[0-9a-f]{64}\n/,'')))
  const present = new Set<string>()
  for (const block of document.blocks) {
    const inlines = 'items' in block ? block.items.flat() : block.content
    for (const inline of inlines) {
      if (!inline.href) continue
      const action = actions.find(name => inline.href === actionBase + name)
      if (!action || (kind === 'print' && action !== 'order')) throw new Error('Use only this book’s email actions')
      if (inline.text.trim()) present.add(action)
    }
  }
  if (!present.has('order') || (kind === 'pdf' && !present.has('pdf'))) throw new Error('Keep the order and download actions in the email')
  return document
}

export function validatedReleaseNote(value: unknown, kind: 'pdf' | 'print') {
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error('Invalid email body')
  if (!readReleaseBody(value,kind) && value.length > 4000) throw new Error('Invalid email message')
  return value
}

export function encodeReleaseBody(document: GeneralMailDocument, fingerprint?:string) {
  return releaseBodyPrefix + (fingerprint ? 'default:'+fingerprint+'\n' : '') + JSON.stringify(document)
}
