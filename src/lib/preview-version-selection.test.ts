import assert from 'node:assert/strict'
import test from 'node:test'
import { carryPreviewVersionChoices, PreviewVersionLockedError } from './preview-version-selection'
import type { DedicationChoice } from './dedication'

const source = { creationId: 'source', jobId: 'source-job' }
const target = { creationId: 'target', jobId: 'target-job' }
const choices = { packageType: 'supreme' as const, voiceAssetId: 'same-consented-asset' }
const message = (creationId: string, body: string | null, purchased = false): DedicationChoice => ({creationId,decision:body?'confirmed':'skipped',body,revision:3,previouslyPurchased:purchased})
function setup(sourceBody: string | null, targetBody: string | null, purchased = false) {
  const writes: unknown[] = []; let current = true
  return { writes, cancel: () => {current=false}, ports: {
    isCurrent: () => current,
    readTargetLock: async () => purchased,
    readMessages: async () => [message('source',sourceBody), message('target',targetBody,purchased)],
    saveConfiguration: async (...args: unknown[]) => { writes.push(['configuration',...args]) },
    saveMessage: async (...args: unknown[]) => { writes.push(['message',...args]) },
  }}
}
test('carries edition and exact voice UUID, then the current message to the selected Creation', async () => {
  const h=setup('For our child','Old message')
  await carryPreviewVersionChoices(source,target,choices,h.ports)
  assert.deepEqual(h.writes,[['configuration',target,choices],['message',message('target','Old message'),'confirmed','For our child']])
})
test('an empty current message clears an older target message through the existing save', async () => {
  const h=setup(null,'Old message');await carryPreviewVersionChoices(source,target,choices,h.ports)
  assert.deepEqual(h.writes[1],['message',message('target','Old message'),'skipped',null])
})
test('does not create an unnecessary dedication revision for an equal effective message', async () => {
  const h=setup('Same','Same');await carryPreviewVersionChoices(source,target,choices,h.ports)
  assert.equal(h.writes.length,1)
})
test('an in-cart unpaid target with the same edition/voice and a different message is refused before any save', async () => {
  const h=setup('New message','In-cart message')
  h.ports.readTargetLock=async()=>true
  h.ports.readMessages=async()=>{throw Error('Must stop before reading/carrying messages')}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),PreviewVersionLockedError)
  assert.deepEqual(h.writes,[])
})
test('an undecided source keeps a confirmed target message without a dedication write', async () => {
  const h=setup(null,'Keep this written text')
  h.ports.readMessages=async()=>[{...message('source',null),decision:'undecided'},message('target','Keep this written text')]
  await carryPreviewVersionChoices(source,target,choices,h.ports)
  assert.deepEqual(h.writes,[['configuration',target,choices]])
})
test('a failed lock read or cancelled lock lookup never reaches a save', async () => {
  const h=setup('New','Old');h.ports.readTargetLock=async()=>{throw Error('Lookup unavailable')}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),/Lookup unavailable/)
  assert.deepEqual(h.writes,[])
  h.ports.readTargetLock=async()=>{h.cancel();return false}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),/cancelled/)
  assert.deepEqual(h.writes,[])
})
test('a paid target with a different message is refused before any write', async () => {
  const h=setup('New','Paid message',true)
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),PreviewVersionLockedError)
  assert.deepEqual(h.writes,[])
})
test('an existing cart/configuration guard refusal never writes the message', async () => {
  const h=setup('New','Old');h.ports.saveConfiguration=async()=>{throw new PreviewVersionLockedError()}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),PreviewVersionLockedError)
  assert.deepEqual(h.writes,[])
})
test('a stale read is cancelled before any write; a stale in-flight save cannot commit selection', async () => {
  const h=setup('New','Old');h.ports.readMessages=async()=>{h.cancel();return [message('source','New'),message('target','Old')]}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),/cancelled/)
  assert.deepEqual(h.writes,[])
  const h2=setup('New','Old');h2.ports.saveConfiguration=async()=>{h2.cancel()}
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h2.ports),/cancelled/)
  assert.deepEqual(h2.writes,[])
})
test('a mismatched message read is rejected before writes', async () => {
  const h=setup('New','Old');h.ports.readMessages=async()=>[message('other','New'),message('target','Old')]
  await assert.rejects(carryPreviewVersionChoices(source,target,choices,h.ports),/identity/)
  assert.deepEqual(h.writes,[])
})
