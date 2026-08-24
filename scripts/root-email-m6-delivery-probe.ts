import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const TEST_RECIPIENTS = {
  delivered: 'delivered',
  bounced: 'bounced',
  complained: 'complained',
  suppressed: 'suppressed',
} as const

type ProbeEvent = keyof typeof TEST_RECIPIENTS

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv: string[]) {
  const options: {
    confirm: boolean
    envFile: string
    event?: ProbeEvent
    runId?: string
  } = { confirm: false, envFile: '.env.local' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--confirm') {
      options.confirm = true
      continue
    }
    if (arg === '--event' || arg === '--run-id' || arg === '--env-file') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      if (arg === '--event') options.event = value as ProbeEvent
      if (arg === '--run-id') options.runId = value
      if (arg === '--env-file') options.envFile = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function loadEnvFile(relativePath: string) {
  const target = path.resolve(projectRoot, relativePath)
  if (!fs.existsSync(target)) throw new Error(`Environment file not found: ${relativePath}`)
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

function deterministicUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.confirm) throw new Error('Refusing to send without --confirm')
  if (!options.event || !(options.event in TEST_RECIPIENTS)) {
    throw new Error('--event must be delivered, bounced, complained, or suppressed')
  }
  if (!options.runId || !/^[A-Za-z0-9_-]{4,64}$/.test(options.runId)) {
    throw new Error('--run-id must be 4-64 letters, numbers, underscores, or hyphens')
  }

  loadEnvFile(options.envFile)

  const inboundDomain = process.env.SUPPORT_INBOUND_DOMAIN?.trim().toLowerCase()
  const supportSender = process.env.EMAIL_FROM_SUPPORT?.trim().toLowerCase()
  if (!inboundDomain?.endsWith('.resend.app')) {
    throw new Error('SUPPORT_INBOUND_DOMAIN must be the M6 managed *.resend.app domain')
  }
  if (!supportSender?.includes('support@ymistory.com')) {
    throw new Error('EMAIL_FROM_SUPPORT must resolve to support@ymistory.com')
  }
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('RESEND_API_KEY and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const label = `${options.runId}-${options.event}`.toLowerCase()
  const localPart = TEST_RECIPIENTS[options.event]
  const recipient = options.event === 'suppressed'
    ? 'suppressed@resend.dev'
    : `${localPart}+${label}@resend.dev`
  const replyId = deterministicUuid(`m6-delivery:${options.runId}:${options.event}`)
  const inboundEmailId = deterministicUuid(`m6-envelope:${options.runId}:${options.event}`)

  const { sendGeneralInboxReplyEmail } = await import('../src/lib/email')
  const result = await sendGeneralInboxReplyEmail({
    to: recipient,
    inboundEmailId,
    replyId,
    replyBody: `YMI M6 ${options.event} delivery probe. No reply is required.`,
    replyTo: `admin@${inboundDomain}`,
    senderKey: 'admin',
    subject: `[YMI M6 ${options.runId}] ${options.event} delivery probe`,
  })

  console.log(JSON.stringify({
    event: options.event,
    runId: options.runId,
    skipped: result.skipped,
    emailEventId: result.emailEventId,
    providerMessageId: result.providerMessageId,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
