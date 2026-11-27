import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { DeliveryEmail } from '@/components/emails/DeliveryEmail'
import { PrintReleasedEmail } from '@/components/emails/PrintReleasedEmail'
import { emailAsset } from '@/components/emails/EmailLayout'
import { originalBodyFingerprint } from '@/lib/release-mail-body'

type Context = { kind:'pdf'|'print'; firstName?:string|null; orderId:string; displayId?:string|null;
  edition?:string|null; bookTitle?:string; coverImageUrl?:string|null }

export async function releaseTemplateSnapshot(c:Context) {
  // Signed links (and their expiry) are generated separately for the actual send.
  const coverMarker='https://release-action.invalid/cover.png'
  const original=await render(c.kind==='pdf' ? createElement(DeliveryEmail,{
    editorSource:true,pdfOnly:c.edition==='digital',firstName:c.firstName,displayId:c.displayId,orderId:c.orderId,
    coverImageUrl:coverMarker,orderUrl:'#order',downloadUrl:'#pdf',voiceUpgradeUrl:c.edition==='basic'?'#upgrade':undefined,
    voiceMaterialsUrl:c.edition==='supreme'?'#materials':undefined,privacyUrl:c.edition==='supreme'?'#privacy':undefined,
  }) : createElement(PrintReleasedEmail,{editorSource:true,firstName:c.firstName,orderId:c.orderId,bookTitle:c.bookTitle ?? ''}))
  const cover=c.coverImageUrl || emailAsset('cover-placeholder.png')
  return { fingerprint:createHash('sha256').update(original).digest('hex'),
    html:original.replaceAll(coverMarker,()=>cover.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')) }
}

export async function releaseRenderNote(note:string|undefined,c:Context) {
  const fingerprint=originalBodyFingerprint(note)
  if(fingerprint && fingerprint===(await releaseTemplateSnapshot(c)).fingerprint)return undefined
  return note
}
