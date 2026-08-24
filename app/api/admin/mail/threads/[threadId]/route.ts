import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  loadGeneralMailThreadDetail,
  updateGeneralMailThreadState,
} from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
async function readThreadId(context: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await context.params
  return isUuid(threadId) ? threadId : null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const threadId = await readThreadId(context)
  if (!threadId) return jsonNoStore({ error: 'Invalid thread id' }, 400)
  try {
    const thread = await loadGeneralMailThreadDetail(threadId)
    if (!thread) return jsonNoStore({ error: 'Mail thread not found' }, 404)
    return jsonNoStore({ thread })
  } catch (error) {
    console.error('[general-mail] failed to load thread', { threadId, error })
    return jsonNoStore({ error: 'Failed to load mail thread' }, 500)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const threadId = await readThreadId(context)
  if (!threadId) return jsonNoStore({ error: 'Invalid thread id' }, 400)
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  if (!['mark_read', 'mark_unread', 'archive', 'restore'].includes(action)) {
    return jsonNoStore({ error: 'Invalid thread action' }, 400)
  }
  try {
    const thread = await updateGeneralMailThreadState({
      threadId,
      action: action as 'mark_read' | 'mark_unread' | 'archive' | 'restore',
    })
    if (!thread) return jsonNoStore({ error: 'Mail thread not found' }, 404)
    return jsonNoStore({ ok: true, thread })
  } catch (error) {
    console.error('[general-mail] failed to update thread', { threadId, action, error })
    return jsonNoStore({ error: 'Failed to update mail thread' }, 500)
  }
}
