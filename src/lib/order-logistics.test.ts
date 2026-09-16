import assert from 'node:assert/strict'
import test from 'node:test'
import {
  haveLogisticsDetailsChanged,
  normalizeTrackingUrl,
  shouldSendLogisticsUpdateEmail,
  parseAdminLogisticsPatch,
} from '@/lib/order-logistics'

test('tracking URLs accept only explicit http and https destinations', () => {
  assert.equal(normalizeTrackingUrl(' https://carrier.example/track/123 '), 'https://carrier.example/track/123')
  assert.equal(normalizeTrackingUrl(''), null)
  assert.throws(() => normalizeTrackingUrl('javascript:alert(1)'), /http or https/)
  assert.throws(() => normalizeTrackingUrl('//carrier.example/track/123'), /http or https/)
})

test('logistics patches preserve omitted fields and require the current order identity', () => {
  const expected={expectedStatus:'shipped',expectedUpdatedAt:null}
  assert.deepEqual(parseAdminLogisticsPatch({...expected,autoDelivery:false}).patch,{expectedStatus:'shipped',autoDelivery:false})
  assert.deepEqual(parseAdminLogisticsPatch({...expected,trackingNumber:''}).patch,{expectedStatus:'shipped',trackingNumber:null})
  for (const body of [{},{...expected,expectedStatus:'cancelled'},{...expected,expectedUpdatedAt:undefined},
    {...expected,expectedRevision:-1},{...expected,autoDelivery:'true'},{...expected,provider:'other'},
    {...expected,trackingNumber:'x'.repeat(101)},{...expected,trackingUrl:'javascript:bad'}]) {
    assert.throws(()=>parseAdminLogisticsPatch(body))
  }
})

test('manual progress records are independently identified, bounded and timezone explicit', () => {
  const body={expectedStatus:'shipped',expectedUpdatedAt:'2026-09-16T00:00:00Z',expectedRevision:1,
    manualEvent:{key:'manual:fixture',description:' Warehouse follow-up ',time:'2026-09-16T08:00:00+08:00',country:'gb'}}
  assert.deepEqual(parseAdminLogisticsPatch(body).patch.manualEvent,{...body.manualEvent,description:'Warehouse follow-up',country:'GB'})
  for (const manualEvent of [{...body.manualEvent,description:''},{...body.manualEvent,description:'x'.repeat(501)},
    {...body.manualEvent,time:'2026-09-16T00:00:00'},{...body.manualEvent,country:'UKK'},{...body.manualEvent,key:'bad/key'}]) {
    assert.throws(()=>parseAdminLogisticsPatch({...body,manualEvent}))
  }
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
