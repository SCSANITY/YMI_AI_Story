import assert from 'node:assert/strict'
import test from 'node:test'
import { mapBookTypeToDisplay } from '@/lib/bookType'
import { normalizePurchasePackageType } from '@/lib/purchase-configuration'

test('current physical packages keep their job transport labels', () => {
  assert.equal(mapBookTypeToDisplay('basic'), 'Classic')
  assert.equal(mapBookTypeToDisplay('supreme'), 'Signature Voice')
})

test('retired paid job labels are preserved without making those packages sellable', () => {
  assert.equal(mapBookTypeToDisplay('digital'), 'Cloud Explorer')
  assert.equal(mapBookTypeToDisplay('premium'), 'Immersive')
  assert.equal(normalizePurchasePackageType('digital'), null)
  assert.equal(normalizePurchasePackageType('premium'), null)
})
