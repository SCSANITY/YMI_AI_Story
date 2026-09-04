import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { loadGeneralMailThreadSummaries } from '@/lib/general-mail-server'
import { isGeneralMailboxKey } from '@/lib/general-inbox-mailboxes'
import { isGeneralMailFolder } from '@/lib/general-mail-workspace'

function readBoundedInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null
}

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const url = new URL(request.url)
  const mailboxKey = url.searchParams.get('mailboxKey')
  const folder = url.searchParams.get('folder')
  const search = (url.searchParams.get('search') ?? '').trim()
  const limit = readBoundedInteger(url.searchParams.get('limit'), 50, 100)
  const offset = readBoundedInteger(url.searchParams.get('offset'), 0, 1_000_000)
  if (
    !isGeneralMailboxKey(mailboxKey)
    || !isGeneralMailFolder(folder)
    || search.length > 100
    || limit === null
    || limit < 1
    || offset === null
  ) {
    return jsonNoStore({ error: 'Invalid mailbox view' }, 400)
  }
  try {
    const page = await loadGeneralMailThreadSummaries({
      mailboxKey,
      folder,
      search,
      limit,
      offset,
    })
    return jsonNoStore(page)
  } catch (error) {
    console.error('[general-mail] failed to load threads', { mailboxKey, folder, error })
    return jsonNoStore({ error: 'Failed to load mail' }, 500)
  }
}
