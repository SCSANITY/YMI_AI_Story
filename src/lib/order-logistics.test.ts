import assert from 'node:assert/strict'
import test from 'node:test'
import {
  haveLogisticsDetailsChanged,
  normalizeTrackingUrl,
  shouldSendLogisticsUpdateEmail,
} from '@/lib/order-logistics'

test('tracking URLs accept only explicit http and https destinations', () => {
  assert.equal(normalizeTrackingUrl(' https://carrier.example/track/123 '), 'https://carrier.example/track/123')
  assert.equal(normalizeTrackingUrl(''), null)
  assert.throws(() => normalizeTrackingUrl('javascript:alert(1)'), /http or https/)
  assert.throws(() => normalizeTrackingUrl('//carrier.example/track/123'), /http or https/)
})

test('shipped orders notify again when tracking details change', () => {
  const previous = {
    trackingNumber: 'OLD',
    trackingCarrier: 'DHL',
    trackingUrl: 'https://carrier.example/old',
    note: null,
  }
  const next = { ...previous, trackingNumber: 'NEW' }
  assert.equal(haveLogisticsDetailsChanged(previous, next), true)
  assert.equal(shouldSendLogisticsUpdateEmail({
    hasRecipient: true,
    nextStatus: 'shipped',
    statusChanged: false,
    trackingDetailsChanged: true,
  }), true)
  assert.equal(shouldSendLogisticsUpdateEmail({
    hasRecipient: true,
    nextStatus: 'production',
    statusChanged: false,
    trackingDetailsChanged: true,
  }), false)
})

test('status transitions still notify while paid and recipient-less updates do not', () => {
  for (const nextStatus of ['production', 'shipped', 'delivered']) {
    assert.equal(shouldSendLogisticsUpdateEmail({
      hasRecipient: true,
      nextStatus,
      statusChanged: true,
      trackingDetailsChanged: false,
    }), true)
  }
  assert.equal(shouldSendLogisticsUpdateEmail({
    hasRecipient: true,
    nextStatus: 'paid',
    statusChanged: true,
    trackingDetailsChanged: true,
  }), false)
  assert.equal(shouldSendLogisticsUpdateEmail({
    hasRecipient: false,
    nextStatus: 'shipped',
    statusChanged: true,
    trackingDetailsChanged: true,
  }), false)
})
