import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { dispatchPrintNotice, readPrintNoticeStatus } from '@/lib/print-release-notice-server'
import { isUuid } from '@/lib/validators'

type Context = { params: Promise<{ finalJobId: string }> }

async function handle(context: Context, retry: boolean) {
  const { finalJobId } = await context.params
  if (!isUuid(finalJobId)) return noStoreJson({ error: 'Invalid job' }, { status: 400 })
  try {
    const status = await (retry ? dispatchPrintNotice(finalJobId) : readPrintNoticeStatus(finalJobId))
    return noStoreJson({ status })
  } catch {
    return noStoreJson({ error: 'Could not verify print notification' }, { status: 503 })
  }
}
export async function GET(_request: Request, context: Context) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  return handle(context, false)
}

export async function POST(_request: Request, context: Context) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  return handle(context, true)
}
