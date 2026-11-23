import { releaseRenderNote,releaseTemplateSnapshot } from '@/lib/release-template-snapshot'
import * as React from 'react'
import { render } from '@react-email/render'
import { DeliveryEmail } from '@/components/emails/DeliveryEmail'
import { PrintReleasedEmail } from '@/components/emails/PrintReleasedEmail'
import { actionBase,encodeReleaseBody,validatedReleaseNote } from '@/lib/release-mail-body'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMAIL_TEMPLATE_CATALOG,
  getEmailTemplateCatalogSummary,
  renderEmailTemplatePreview,
} from './email-template-catalog'

test('email catalog has one unique entry for every active outbound family', () => {
  const ids = EMAIL_TEMPLATE_CATALOG.map((template) => template.id)
  const emailKeys = EMAIL_TEMPLATE_CATALOG.map((template) => template.emailKey)

  assert.equal(EMAIL_TEMPLATE_CATALOG.length, 14)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(emailKeys).size, emailKeys.length)
  assert.doesNotMatch(emailKeys.join(','), /general_inbox_reply/)

  assert.deepEqual(getEmailTemplateCatalogSummary(), {
    total: 14,
    automatic: 8,
    workflow: 3,
    human: 3,
    previewable: 10,
    providerManaged: 3,
  })
})

test('print approval names the released book and opens its order page', async () => {
  const html = (await renderEmailTemplatePreview('print-released') ?? '').replaceAll('<!-- -->', '')
  assert.match(html, /Your YMI Story Book Is Approved!/)
  assert.match(html, /Hi Sophie,/)
  assert.match(html, /<strong>Mia’s Space Mission<\/strong>/)
  assert.match(html, /href="https:\/\/www\.ymistory\.com\/orders\/sample-order"[^>]*>View Your Order &amp; Download PDF<\/a>/)
})

test('every YMI-owned fixed template and variant renders meaningful email HTML', async () => {
  for (const template of EMAIL_TEMPLATE_CATALOG) {
    for (const variant of template.variants) {
      const html = await renderEmailTemplatePreview(template.id, variant.id)
      assert.ok(html, `${template.id}/${variant.id} should render`)
      assert.match(html, /YMI Story|YMI STORY/i, `${template.id}/${variant.id} should be branded`)
      assert.match(html, /<!DOCTYPE html/i, `${template.id}/${variant.id} should be a complete email`)
    }
  }
})

test('provider-owned and freeform families do not render misleading local previews', async () => {
  for (const template of EMAIL_TEMPLATE_CATALOG.filter((entry) => entry.variants.length === 0)) {
    assert.equal(await renderEmailTemplatePreview(template.id), null)
  }
})

test('order confirmation preview demonstrates the personalized title below the cover', async () => {
  const html = await renderEmailTemplatePreview('order-confirmation', 'default', {
    coverImageUrl: 'https://example.test/sophie-cover.webp',
  })
  const cover = html!.slice(html!.indexOf('https://example.test/sophie-cover.webp'), html!.indexOf('Your Order'))
  assert.match(cover, /Sophie(?:'|&#x27;)s Secret Journey Through Eight Plants/)
  assert.doesNotMatch(cover, /Personalized Book Cover/)
})

test('order confirmation variants show a dedication deadline and only prompt for a missing Voice recording', async () => {
  const orderConfirmation = EMAIL_TEMPLATE_CATALOG.find((entry) => entry.id === 'order-confirmation')
  const cases = [
    ['default', false],
    ['voice-pending', true],
    ['voice-ready', false],
    ['mixed-voice-pending', true],
  ] as const
  assert.deepEqual(orderConfirmation?.variants.map(({ id }) => id), cases.map(([id]) => id))
  for (const [id, pendingVoice] of cases) {
    const html = await renderEmailTemplatePreview('order-confirmation', id) ?? ''
    const textHtml = html.replaceAll('<!-- -->', '')
    assert.match(textHtml, /You can review your optional dedication message[\s\S]*? on your materials page\./, id)
    assert.doesNotMatch(html, /dedication deadline|deadline for editing|48 hours|\(UTC\)/, id)
    assert.equal(/Please submit your voice recording on the same page so we can finish your Hardcover \+ Voice book\./.test(html), pendingVoice, id)
    assert.equal((html.match(/Review your book materials/g) ?? []).length, 1, id)
    assert.match(html, /href="https:\/\/www\.ymistory\.com\/orders\/sample-order\/materials"[^>]*>Review your book materials<\/a>/)
    assert.doesNotMatch(html, /Missing recordings delay completion/)
    if (id === 'mixed-voice-pending') {
      assert.match(html, /Secret Journey Through Eight Plants/)
      assert.match(html, /Space Mission/)
    }
  }
})

test('Final PDF Delivery previews show the right actions for each delivered edition', async () => {
  const delivery = EMAIL_TEMPLATE_CATALOG.find(({ id }) => id === 'final-delivery')
  assert.deepEqual(delivery?.variants.map(({ id }) => id), ['default', 'voice'])
  assert.equal(delivery?.subject, 'Important Order Update: Your YMI Story Preview Is Ready')

  for (const [id, showsOffer] of [['default', true], ['voice', false]] as const) {
    const html = (await renderEmailTemplatePreview('final-delivery', id) ?? '').replaceAll('<!-- -->', '')
    const pdfLink = html.match(/<a[^>]+href="https:\/\/www\.ymistory\.com\/api\/orders\/sample-order\/download"[^>]*>View Your Preview \(PDF\)<\/a>/)?.[0]
    const offerLink = html.match(/<a[^>]+href="#signature-voice-upgrade"[^>]*>Upgrade to Signature Voice[^<]*<\/a>/)?.[0]
    const reminder = html.indexOf('BEFORE WE PRINT')
    assert.ok(pdfLink && html.indexOf(pdfLink) < reminder, id)
    assert.match(html, /reply to this email within 48 hours of receiving it/)
    assert.match(html, /href="https:\/\/www\.ymistory\.com\/orders\/sample-order"[^>]*>Open Your Order Page<\/a>/)
    assert.match(html, /Once printing begins, no further changes can be made to the printed book\./)
    assert.match(html, /<p[^>]*>Order(?:&nbsp;|\u00a0)YMI-2026-0903<\/p>/)
    assert.doesNotMatch(html, /<a[^>]*>YMI-2026-0903<\/a>|buy\.stripe\.com/)
    if (showsOffer) {
      assert.ok(offerLink && html.indexOf(offerLink) > reminder)
      const pdfStyle = pdfLink.match(/style="([^"]+)"/)?.[1]
      assert.ok(pdfStyle?.includes('background-color:#f59e0b'))
      assert.equal(offerLink.match(/style="([^"]+)"/)?.[1], pdfStyle)
      assert.doesNotMatch(html, /Your Voice Recording|\/sample-order\/materials/)
    } else {
      assert.equal(offerLink, undefined)
      assert.match(html, /Thank you for choosing our <strong>Signature Voice Version<\/strong>/)
      assert.match(html, /href="https:\/\/www\.ymistory\.com\/orders\/sample-order\/materials"[^>]*>Update Your Voice Recording &amp; Special Message<\/a>/)
      assert.match(html, /if updates are available/)
      assert.match(html, /href="https:\/\/www\.ymistory\.com\/privacy"[^>]*>Privacy Policy<\/a>/)
      assert.doesNotMatch(html, /EXCLUSIVE LAUNCH OFFER|default voice|within 30 days of collection/i)
    }
  }
})

test('unpaid reminder previews show the three approved messages at their existing stage offsets', async () => {
  const template = EMAIL_TEMPLATE_CATALOG.find((entry) => entry.id === 'unpaid-reminder')
  assert.deepEqual(template?.variants.map((variant) => variant.label), ['30 minutes', '24 hours', '6 days'])
  const examples = [
    { stage: 1, body: /A little adventure with Mia at its heart/, cta: 'Bring Their Story to Life', help: true },
    { stage: 2, body: /As Mia steps into the adventure/, cta: 'Complete My Order', help: false },
    { stage: 3, body: /imagine Mia reaching for the one with their name on it/, cta: 'Make Their Story a Reality', help: true },
  ]
  for (const { stage, body, cta, help } of examples) {
    const html = await renderEmailTemplatePreview('unpaid-reminder', `stage-${stage}`, {
      coverImageUrl: 'https://example.test/mia-cover.webp',
    }) ?? ''
    assert.match(html, /Hi Sophie,/)
    assert.match(html, body)
    assert.match(html, /mia-cover\.webp/)
    assert.match(html, /The Secret Journey Through Eight Plants/)
    assert.match(html, /With warmth,[\s\S]*The YMI Story Team/)
    assert.match(html, new RegExp(`href="https://www.ymistory.com/checkout\\?orderId=sample-order"[^>]*>${cta}</a>`))
    assert.equal((html.match(/checkout\?orderId=sample-order/g) ?? []).length, 1)
    assert.equal(/reply to this email/i.test(html), help)
    assert.doesNotMatch(html, /reserved copy is ready for printing/)
  }
})

test('confirmed proof body renders changed paragraphs and resolves only the real book actions', async () => {
  const body=(kind:'print'|'pdf', extra?:string)=>encodeReleaseBody({version:1,blocks:[
    {type:'paragraph',content:[{text:'Corrected second paragraph',marks:['bold']}]},
    {type:'paragraph',content:[{text:'Book order',href:actionBase+'order'}]},
    ...(kind==='pdf'?[{type:'paragraph' as const,content:[{text:'Customer PDF',href:actionBase+'pdf'}]}]:[]),
    ...(extra?[{type:'paragraph' as const,content:[{text:'Edition action',href:extra}]}]:[]),
  ]})
  for(const edition of ['basic','supreme']){
    const action=edition==='basic'?'upgrade':'materials'
    const urls={orderUrl:'https://example.test/orders/a',downloadUrl:'https://example.test/proof/a',
      ...(edition==='basic'?{voiceUpgradeUrl:'https://example.test/upgrade'}:{voiceMaterialsUrl:'https://example.test/materials'})}
    const html=await render(<DeliveryEmail {...urls} personalNote={validatedReleaseNote(body('pdf',actionBase+action),'pdf')}/>)
    assert.match(html,/<strong>Corrected second paragraph<\/strong>/)
    for(const url of Object.values(urls))assert.ok(html.includes('href="'+url+'"'))
    assert.doesNotMatch(html,/release-action\.invalid|Thank you for choosing/)
  }
  const print=await render(<PrintReleasedEmail bookTitle="Fixture" orderId="order-a" personalNote={body('print')}/>)
  assert.match(print,/href="[^"]*\/orders\/order-a"/)
  assert.match(print,/Corrected second paragraph/)
  assert.throws(()=>validatedReleaseNote(body('pdf','https://untrusted.example'),'pdf'),/only this book/)
  assert.throws(()=>validatedReleaseNote(body('print'),'pdf'),/Keep the order/)
})

test('unmodified proof keeps branded sections; a changed template uses the frozen customer copy',async()=>{
  const ctx={kind:'pdf' as const,firstName:'Mira',edition:'basic',orderId:'controlled-a'}
  const first=await releaseTemplateSnapshot(ctx)
  const note=encodeReleaseBody({version:1,blocks:[{type:'paragraph',content:[{text:'Saved copy'}]}]},first.fingerprint)
  assert.equal(await releaseRenderNote(note,ctx),undefined)
  assert.equal(await releaseRenderNote(note,{...ctx,edition:'supreme'}),note)
  assert.equal(await releaseRenderNote(note,{...ctx,firstName:'Alex'}),note)
  assert.match(first.html,/BEFORE WE PRINT/)
})
