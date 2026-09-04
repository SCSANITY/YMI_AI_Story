import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { getGeneralMailPrimaryAddress } from '@/lib/general-mail'
import { loadGeneralMailMailboxCounts } from '@/lib/general-mail-server'

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  try {
    const counts = await loadGeneralMailMailboxCounts()
    return jsonNoStore({
      mailboxes: counts.map((mailbox) => ({
        ...mailbox,
        address: getGeneralMailPrimaryAddress(mailbox.mailboxKey),
      })),
    })
  } catch (error) {
    console.error('[general-mail] failed to load mailbox counts', error)
    return jsonNoStore({ error: 'Failed to load mailboxes' }, 500)
  }
}
