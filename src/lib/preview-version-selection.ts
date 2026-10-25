import type { DedicationChoice } from './dedication'
import type { PurchasePackageType } from './purchase-configuration'

export class PreviewVersionLockedError extends Error {
  constructor() { super('This version is locked by your cart or purchase. Your current version and choices have been kept.') }
}

type Identity = { creationId: string; jobId: string }
type Choices = { packageType: PurchasePackageType; voiceAssetId: string | null }
type Ports = {
  readMessages: (ids: string[]) => Promise<DedicationChoice[]>
  saveMessage: (target: DedicationChoice, decision: 'confirmed' | 'skipped', body: string | null) => Promise<unknown>
  saveConfiguration: (target: Identity, choices: Choices) => Promise<unknown>
  isCurrent: () => boolean
}

// Existing guarded saves remain the only writers. Selection commits only after
// all saves succeed; these independent routes are not represented as atomic.
export async function carryPreviewVersionChoices(source: Identity, target: Identity, choices: Choices, ports: Ports) {
  const assertCurrent = () => { if (!ports.isCurrent()) throw new Error('Version selection was cancelled.') }
  assertCurrent()
  const [message, targetMessage] = await ports.readMessages([source.creationId, target.creationId])
  assertCurrent()
  if (!message || !targetMessage || message.creationId !== source.creationId || targetMessage.creationId !== target.creationId) throw new Error('Version message identity changed.')
  const body = message.decision === 'confirmed' ? message.body : null
  const decision = body ? 'confirmed' : 'skipped'
  const targetBody = targetMessage.decision === 'confirmed' ? targetMessage.body : null
  const messageChanged = body !== targetBody
  if (messageChanged && targetMessage.previouslyPurchased) throw new PreviewVersionLockedError()
  await ports.saveConfiguration(target, choices)
  assertCurrent()
  if (messageChanged) await ports.saveMessage(targetMessage, decision, body)
  assertCurrent()
}
