import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const templates = path.resolve(root, 'tests', 'fixtures', 'external-contracts', 'sql')

async function read(relativePath, base = root) {
  return readFile(path.join(base, relativePath), 'utf8')
}

test('professional reply aliases keep private tokens while routing new customer-facing addresses', async () => {
  const [sql, support, kol, processor, supportRoute, kolRoute, supportList, supportDetail] =
    await Promise.all([
      read('sql_professional_email_reply_aliases.sql', templates),
      read('src/lib/support-ticket.ts'),
      read('src/lib/kol-partnership-email.ts'),
      read('src/lib/inbound-email-processing.ts'),
      read('app/api/admin/support/tickets/[questionId]/messages/route.ts'),
      read('app/api/admin/kol-partnerships/[leadId]/messages/route.ts'),
      read('app/api/admin/support/tickets/route.ts'),
      read('app/api/admin/support/tickets/[questionId]/route.ts'),
    ])

  assert.match(sql, /alter table public\.support_questions[\s\S]*add column if not exists reply_alias text/)
  assert.match(sql, /alter table public\.kol_collaboration_leads[\s\S]*add column if not exists reply_alias text/)
  assert.match(sql, /\^\[23456789abcdefghjkmnpqrstuvwxyz\]\{12\}\$/)
  assert.match(sql, /support_questions_reply_alias_key/)
  assert.match(sql, /kol_collaboration_leads_reply_alias_key/)
  assert.match(sql, /alter column reply_alias set not null/g)
  assert.doesNotMatch(sql, /drop column (?:if exists )?reply_token/i)

  assert.match(support, /`case-\$\{formatEmailRouteAlias\(replyAlias\)\}@\$\{domain\}`/)
  assert.match(kol, /`partner-\$\{formatEmailRouteAlias\(replyAlias\)\}@\$\{domain\}`/)
  assert.match(support, /currentMatch = localPart\.match\(\/\^support\\\+/)
  assert.match(kol, /currentMatch = localPart\.match\(\/\^partners\\\+/)
  assert.match(support, /legacyMatch = localPart\.match\(\/\^ticket-/)
  assert.match(kol, /legacyMatch = localPart\.match\(\/\^collab-/)

  assert.match(processor, /\.eq\(['"]reply_alias['"], routedAddress\.replyAlias\)/g)
  assert.match(processor, /\.eq\(['"]reply_token['"], routedAddress\.replyToken\)/g)
  assert.match(supportRoute, /reply_alias/)
  assert.match(kolRoute, /reply_alias/)
  assert.doesNotMatch(supportList + supportDetail, /reply_alias|reply_token/)
})
