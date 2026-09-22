import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEDICATION_SAMPLE, dedicationBodyMetrics, normalizeDedicationBody, validDedicationBody,
} from './dedication'

test('dedication normalization preserves intentional internal paragraphs', () => {
  assert.equal(normalizeDedicationBody('\r\n  Dear child,\r\n\r\nWith love.\r\n'), 'Dear child,\n\nWith love.')
})

test('blank input and provisional character/line bounds fail closed', () => {
  assert.equal(validDedicationBody(' \n '), false)
  assert.equal(validDedicationBody('a'.repeat(300)), true)
  assert.equal(validDedicationBody('a'.repeat(301)), false)
  assert.equal(validDedicationBody(Array(9).fill('line').join('\n')), true)
  assert.equal(validDedicationBody(Array(10).fill('line').join('\n')), false)
})

test('Unicode code points and sample text use the shared client/server counter', () => {
  assert.deepEqual(dedicationBodyMetrics('😀\r\n好'), { normalized: '😀\n好', characters: 3, lineBreaks: 1 })
  assert.equal(validDedicationBody(DEDICATION_SAMPLE), true)
})
