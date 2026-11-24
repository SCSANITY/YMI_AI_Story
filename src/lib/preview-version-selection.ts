import type { DedicationChoice } from './dedication'
import type { PurchasePackageType } from './purchase-configuration'

export class PreviewVersionLockedError extends Error {
  constructor() { super('This version is locked by your cart or purchase. Your current version and choices have been kept.') }
}

type Identity = { creationId: string; jobId: string }
type Choices = { packageType: PurchasePackageType; voiceAssetId: string | null }
type Ports = {
  readTargetLock: (target: Identity) => Promise<boolean>
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
  const locked = await ports.readTargetLock(target)
  assertCurrent()
  if (locked) throw new PreviewVersionLockedError()
  if (choices.packageType === 'digital') {
    await ports.saveConfiguration(target, choices)
    assertCurrent()
    return
  }
  const [message, initialTarget] = await ports.readMessages([source.creationId, target.creationId])
  assertCurrent()
  if (!message || !initialTarget || message.creationId !== source.creationId || initialTarget.creationId !== target.creationId) throw new Error('Version message identity changed.')
  if (initialTarget.previouslyPurchased) throw new PreviewVersionLockedError()
  await ports.saveConfiguration(target, choices)
  assertCurrent()
  if (message.decision === 'undecided') return
  let targetMessage = initialTarget
  if (targetMessage.dedicationUnavailable) {
    // A former PDF target exposes its physical draft revision only after the edition changes.
    const [restored] = await ports.readMessages([target.creationId])
    assertCurrent()
    if (!restored || restored.creationId !== target.creationId || restored.dedicationUnavailable) throw new Error('Version message identity changed.')
    if (restored.previouslyPurchased) throw new PreviewVersionLockedError()
    targetMessage = restored
  }
  const body = message.decision === 'confirmed' ? message.body : null
  const targetBody = targetMessage.decision === 'confirmed' ? targetMessage.body : null
  if (body !== targetBody) await ports.saveMessage(targetMessage, body ? 'confirmed' : 'skipped', body)
  assertCurrent()
}
