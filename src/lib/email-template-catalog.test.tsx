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

  assert.equal(EMAIL_TEMPLATE_CATALOG.length, 12)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(emailKeys).size, emailKeys.length)
  assert.doesNotMatch(emailKeys.join(','), /general_inbox_reply/)

  assert.deepEqual(getEmailTemplateCatalogSummary(), {
    total: 12,
    automatic: 7,
    workflow: 2,
    human: 3,
    previewable: 8,
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

test('unpaid reminder preview uses the personalized child-name copy', async () => {
  const template = EMAIL_TEMPLATE_CATALOG.find((entry) => entry.id === 'unpaid-reminder')
  const html = await renderEmailTemplatePreview('unpaid-reminder')

  assert.equal(template?.subject, '{Name}’s magical journey is waiting! ✨')
  assert.match(html ?? '', /Sophie’s magical journey is waiting! ✨/)
  assert.match(html ?? '', /Give Sophie a gift they’ll treasure forever—your reserved copy is ready for printing!/)
  assert.doesNotMatch(html ?? '', /Still Interested in Your Story|Resume Checkout/)
})
