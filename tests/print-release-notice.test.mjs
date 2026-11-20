import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

function fixture() {
  const events = new Map()
  const jobs = new Map()
  const sends = []
  const controls = { reject: false, loseReceipt: false, admin: true }
  const order = { order_id: 'order-a', order_status: 'paid' }
  class EmailNotAcceptedError extends Error {}
  for (const id of ['book-a', 'book-b']) {
    jobs.set(id, { ...order, final_job_id: id, job_id: id, creation_id: id, template_id: id,
      print_released_at: null, purchased_line: { ...order, creation_id: id, final_job_id: id,
        status: 'ordered', product_type: 'physical', package_type: 'basic' } })
  }
  const db = {
    async rpc(name, args) {
      assert.equal(name,'materials_release_print_with_notice')
      const job = jobs.get(args.p_final_job_id)
      if (!job || args.p_expected_artifact_id !== 'verified') return { error: { message: 'not verified' } }
      const already = Boolean(job.print_released_at)
      if (!already) {
        job.print_released_at = 'released'
        events.set(job.final_job_id, { email_event_id: job.final_job_id, order_id: order.order_id,
          final_job_id: job.final_job_id, idempotency_key: 'print_released:' + job.final_job_id,
          email_key: 'print_released', updated_at: 'initial', status: 'pending', context: { dispatch: 'queued', firstName: 'Amy' },
          to_email: 'amy@example.invalid' })
      }
      return { data: [{ released_at: 'released', release_result: already ? 'already_released' : 'released' }] }
    },
    from(table) {
      assert.ok(['email_events','final_jobs'].includes(table))
      const filters = []
      let change
      let selection
      return {
        select(fields) { selection=fields; return this },
        eq(key,value) { filters.push([key,value]); return this },
        update(value) { change=value; return this },
        neq(key,value) { assert.equal(key,'status'); assert.equal(value,'external_observed'); return this },
        order() { return this },
        async range(start,end) {
          assert.match(selection,/book_title:context->>bookTitle/)
          const rows = [...events.values()].filter(r=>filters.every(([k,v])=>r[k]===v))
          return { data:rows.slice(start,end+1).map(r=>({...r,book_title:r.context.bookTitle})),count:rows.length }
        },
        async maybeSingle() {
          const rows = table === 'email_events' ? events : jobs
          const row = [...rows.values()].find(r=>filters.every(([k,v])=>(k==='context->>dispatch' ? r.context.dispatch : r[k])===v))
          if (row && change) Object.assign(row,change)
          return { data: row ? structuredClone(row) : null }
        },
      }
    },
  }
  const stubs = {
    'server-only': {}, '@/lib/supabaseAdmin': { supabaseAdmin: db },
    '@/components/emails/PrintReleasedEmail': { PRINT_RELEASED_SUBJECT: 'Your YMI Story Book Is Approved!' },
    '@/lib/email': { EmailNotAcceptedError, async sendClaimedPrintNotice(args) {
      if (controls.reject) throw new EmailNotAcceptedError('Mailbox rejected')
      sends.push(args)
      return 'provider-' + sends.length
    } },
    '@/lib/emailEvents': {
      async markEmailEventSent(id, providerId) {
        if (controls.loseReceipt) throw Error('local write failed')
        Object.assign(events.get(id), { status:'sent', resend_message_id:providerId })
      },
      async markEmailEventFailed(id) { events.get(id).status='failed' },
    },
    '@/lib/adminAuth': { requireAdminCustomer: async()=>controls.admin ? { customer_id:'admin' } : null },
    '@/lib/http-response': { noStoreJson: Response.json },
    '@/lib/manual-print-artifact': { isUuid: Boolean }, '@/lib/validators': { isUuid: Boolean },
  }
  const sender = loadUi('src/lib/print-release-notice-server.ts',stubs)
  stubs['@/lib/print-release-notice-server']=sender
  const routes='app/api/admin/final-jobs/[finalJobId]/'
  const releaseRoute=loadUi(routes+'release-print/route.ts',stubs)
  const retryRoute=loadUi(routes+'print-notification/route.ts',stubs)
  const activityRoute=loadUi('app/api/admin/orders/[orderId]/email-activity/route.ts',stubs,{ URL })
  const ctx=id=>({ params: Promise.resolve({ finalJobId:id }) })
  return { events, sends, order, controls, sender,
    release: (id, artifact='verified')=>releaseRoute.POST({ json:async()=>({ expectedArtifactId:artifact }) },ctx(id)),
    activity: orderId=>activityRoute.GET(new Request('https://example.invalid/activity'), {params:Promise.resolve({orderId})}),
    retry: id=>retryRoute.POST({},ctx(id)), read: id=>retryRoute.GET({},ctx(id)) }
}

test('two books have distinct tracked print notices; failed release and replay do not send', async()=>{
  const f=fixture()
  assert.equal((await f.release('book-a','unverified')).status,409)
  assert.equal(f.events.size,0)
  for (const id of ['book-a','book-b']) {
    assert.equal((await (await f.release(id)).json()).noticeStatus,'sent')
    assert.equal((await (await f.release(id)).json()).alreadyReleased,true)
  }
  assert.deepEqual(f.sends.map(s=>[s.orderId,s.idempotencyKey]), [
    ['order-a','print_released:book-a'],['order-a','print_released:book-b'],
  ])
  assert.notEqual(f.sends[0].bookTitle,f.sends[1].bookTitle)
  assert.equal(f.order.order_status,'paid')
  assert.ok([...f.events.values()].every(e=>e.status==='sent' && e.context.bookTitle && e.resend_message_id))
  const activity=await (await f.activity('order-a')).json()
  assert.equal(activity.total,2)
  assert.deepEqual(activity.events.map(e=>[e.final_job_id,e.book_title,e.status]),[
    ['book-a',f.sends[0].bookTitle,'sent'], ['book-b',f.sends[1].bookTitle,'sent'],
  ])
  assert.equal((await (await f.activity('order-other')).json()).total,0)
})

test('rejected mail can be retried concurrently without releasing again',async()=>{
  const f=fixture()
  f.controls.reject=true
  assert.equal((await (await f.release('book-a')).json()).noticeStatus,'failed')
  f.controls.reject=false
  assert.equal((await (await f.read('book-a')).json()).status,'failed')
  assert.equal(f.sends.length,0)
  await Promise.all([f.retry('book-a'),f.retry('book-a')])
  assert.equal(f.sends.length,1)
  assert.equal((await (await f.read('book-a')).json()).status,'sent')
  f.controls.admin=false
  assert.equal((await f.retry('book-a')).status,403)
})

test('missing provider receipt stays unconfirmed; old jobs without a notice stay silent',async()=>{
  const f=fixture()
  assert.equal((await (await f.retry('book-b')).json()).status,'none')
  f.controls.loseReceipt=true
  assert.equal((await (await f.release('book-a')).json()).noticeStatus,'check_status')
  assert.equal((await (await f.retry('book-a')).json()).status,'awaiting_confirmation')
  assert.equal(f.sends.length,1)
})
