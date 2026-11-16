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

  assert.equal(EMAIL_TEMPLATE_CATALOG.length, 13)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(emailKeys).size, emailKeys.length)
  assert.doesNotMatch(emailKeys.join(','), /general_inbox_reply/)

  assert.deepEqual(getEmailTemplateCatalogSummary(), {
    total: 13,
    automatic: 8,
    workflow: 2,
    human: 3,
    previewable: 9,
    providerManaged: 3,
  })
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
    ['default', true, false],
    ['voice-pending', true, true],
    ['voice-ready', true, false],
    ['mixed-voice-pending', true, true],
    ['hardcover-closed', false, false],
    ['voice-pending-closed', false, true],
    ['voice-ready-closed', false, false],
  ] as const
  assert.deepEqual(orderConfirmation?.variants.map(({ id }) => id), cases.map(([id]) => id))
  for (const [id, updateOpen, pendingVoice] of cases) {
    const html = await renderEmailTemplatePreview('order-confirmation', id) ?? ''
    const textHtml = html.replaceAll('<!-- -->', '')
    assert.equal(/You can add or edit an optional dedication message[\s\S]*? until [^<]*\(UTC\)\./.test(textHtml), updateOpen, id)
    assert.equal(/The deadline for editing your dedication has passed\./.test(html), !updateOpen, id)
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
