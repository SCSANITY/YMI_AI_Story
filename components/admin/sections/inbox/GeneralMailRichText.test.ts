import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import type { GeneralMailDocument } from '@/lib/general-mail-content'
import {
  generalMailDocumentToTiptapJson,
  tiptapJsonToGeneralMailDocument,
} from './GeneralMailRichText'

test('general mail rich text preserves supported blocks, marks, lists, and links', () => {
  const document: GeneralMailDocument = {
    version: 1,
    blocks: [
      {
        type: 'paragraph',
        content: [
          { text: 'Bold', marks: ['bold'] },
          { text: ' italic', marks: ['italic'] },
          { text: ' underline', marks: ['underline'] },
          { text: ' link', href: 'https://ymistory.com/books' },
        ],
      },
      { type: 'heading', content: [{ text: 'Heading' }] },
      { type: 'quote', content: [{ text: 'Quoted text', marks: ['italic'] }] },
      {
        type: 'bulletList',
        items: [[{ text: 'Bullet one' }], [{ text: 'Bullet two', marks: ['bold'] }]],
      },
      {
        type: 'orderedList',
        items: [[{ text: 'First' }], [{ text: 'Second', marks: ['underline'] }]],
      },
    ],
  }

  const converted = tiptapJsonToGeneralMailDocument(generalMailDocumentToTiptapJson(document))

  assert.deepEqual(converted, document)
})

test('general mail rich text drops unsafe link protocols', () => {
  const content: JSONContent = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Unsafe link',
        marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
      }],
    }],
  }

  assert.deepEqual(tiptapJsonToGeneralMailDocument(content), {
    version: 1,
    blocks: [{ type: 'paragraph', content: [{ text: 'Unsafe link' }] }],
  })
})

test('general mail rich text rejects nested lists instead of silently losing their text', () => {
  const nestedList: JSONContent = {
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
          {
            type: 'bulletList',
            content: [{
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }],
            }],
          },
        ],
      }],
    }],
  }

  assert.throws(
    () => tiptapJsonToGeneralMailDocument(nestedList),
    /Nested list content is not supported/,
  )
})
