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
