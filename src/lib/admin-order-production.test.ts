import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  countFinalPageIssues,
  preferredFinalPagePath,
} from '@/lib/admin-order-production'

test('production snapshots prefer approved then manual then AI page bytes', () => {
  assert.equal(preferredFinalPagePath({
    approved_output_path: 'approved.png',
    manual_output_path: 'manual.png',
    ai_output_path: 'ai.png',
  }), 'approved.png')
  assert.equal(preferredFinalPagePath({
    manual_output_path: 'manual.png',
    ai_output_path: 'ai.png',
  }), 'manual.png')
  assert.equal(preferredFinalPagePath({ ai_output_path: 'ai.png' }), 'ai.png')
})

test('production snapshots count failed and needs-fix pages as operational issues', () => {
  assert.equal(countFinalPageIssues([
    { status: 'approved', error_message: null },
    { status: 'needs_fix', error_message: null },
    { status: 'failed', error_message: 'provider error' },
  ]), 2)
})

test('production snapshot jobs expose whether Print handoff applies', () => {
  const source = readFileSync(
    new URL('../../app/api/admin/orders/[orderId]/production/route.ts', import.meta.url),
    'utf8'
  )
  assert.match(source, /requiresPrint:\s*cartItemRequiresPrint\(item\)/)
  assert.match(source, /existing\.requiresPrint\s*=\s*existing\.requiresPrint\s*\|\|\s*cartItemRequiresPrint\(item\)/)
})
