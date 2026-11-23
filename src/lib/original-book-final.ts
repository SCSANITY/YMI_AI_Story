import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { getFinalPageRevisionPath } from '@/lib/final-review-artifact-paths'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export async function prepareOriginalBookFinal(orderId: string, lineId: string) {
  async function reserveOrConfirm(verifiedHashes: string[] | null) {
    const { data, error } = await supabaseAdmin.rpc('prepare_original_book_final', {
      p_order: orderId, p_line: lineId, p_verified_hashes: verifiedHashes,
    })
    if (error) throw new Error('Original Final preparation: ' + error.message)
    if (!data?.finalJobId) throw new Error('Missing original Final identity')
    return data
  }

  const plan = await reserveOrConfirm(null)
  if (plan.prepared === true) return plan.finalJobId as string
  const hashes: unknown = plan.hashes
  if (!Array.isArray(hashes) || hashes.length !== 31 ||
      !hashes.every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Original Final is waiting for its complete edition artwork')
  }

  const storage = supabaseAdmin.storage.from('raw-private')
  async function copyPage(hash: string, index: number) {
    const source = await storage.download('original-editions/' + hash + '.png')
    if (!source.data || source.error) throw new Error('Original artwork missing at page ' + index)
    const bytes = Buffer.from(await source.data.arrayBuffer())
    if (sha256(bytes) !== hash) throw new Error('Original artwork digest mismatch at page ' + index)
    const image = sharp(bytes, { failOn: 'error' })
    if ((await image.metadata()).format !== 'png') throw new Error('Original artwork must be PNG')
    // Decode the full image before approving it. A valid header can hide a truncated payload.
    await image.stats()
    const dest = getFinalPageRevisionPath({ orderId, finalJobId: plan.finalJobId }, index, 'manual', lineId)
    const { error } = await storage.upload(dest, bytes, { contentType: 'image/png', upsert: false })
    if (error) {
      // A preceding attempt may already have written this immutable page.
      const stored = await storage.download(dest)
      if (!stored.data || sha256(Buffer.from(await stored.data.arrayBuffer())) !== hash) {
        throw new Error('Could not confirm original Final page ' + index)
      }
    }
  }

  // Bound the number of decoded pages in memory. Finish in-flight copies before retry.
  for (let start = 0; start < hashes.length; start += 3) {
    const results = await Promise.allSettled(hashes.slice(start, start + 3).map((hash, offset) => copyPage(hash, start + offset)))
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }

  const confirmed = await reserveOrConfirm(hashes)
  if (confirmed.prepared !== true || confirmed.finalJobId !== plan.finalJobId) {
    throw new Error('Could not confirm original Final preparation')
  }
  return confirmed.finalJobId as string
}
