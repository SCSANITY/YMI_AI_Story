import { supabaseAdmin } from '@/lib/supabaseAdmin'

// The new upload is already committed. History pruning is protected in the DB;
// the display limit never permits deleting a source still used by a story.
export async function pruneFaceHistory(ownerType: 'customer' | 'anon', ownerId: string) {
  try {
    const { error } = await supabaseAdmin.rpc('prune_owned_unbound_faces', {
      p_owner_type: ownerType, p_owner_id: ownerId, p_keep: 8,
    })
    if (error) console.warn('[face-history] protected pruning failed', { code: error.code ?? 'unknown' })
  } catch {
    console.warn('[face-history] protected pruning transport failed')
  }
}
