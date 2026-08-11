import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveMx } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'

const REQUIRED_WEBHOOK_EVENTS = [
  'email.received',
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
]

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const options = { strict: false, envFile: '.env.local' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--strict') {
      options.strict = true
      continue
    }
    if (arg === '--base-url' || arg === '--inbound-domain' || arg === '--env-file') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function loadEnvFile(relativePath) {
  const target = path.resolve(projectRoot, relativePath)
  if (!fs.existsSync(target)) return
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

function normalizeUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function normalizeDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/\.$/, '')
  return /^[a-z0-9.-]+$/.test(domain) ? domain : null
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init)
  const body = await response.text()
  let data = null
  if (body) {
    try {
      data = JSON.parse(body)
    } catch {
      data = null
    }
  }
  return { response, data }
}

const options = parseArgs(process.argv.slice(2))
loadEnvFile(options.envFile)

const checks = []
function record(name, status, detail) {
  checks.push({ name, status, detail })
  const marker = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : 'FAIL'
  console.log(`[${marker}] ${name}${detail ? `: ${detail}` : ''}`)
}

function requiredValue(name, fallbackName) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : '')
  if (!value) record(name, 'fail', 'missing')
  else record(name, 'pass', 'present')
  return value
}

const supabaseUrl = normalizeUrl(requiredValue('NEXT_PUBLIC_SUPABASE_URL'))
const serviceKey = requiredValue('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
const resendApiKey = requiredValue('RESEND_API_KEY')
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()
const cronSecret = process.env.CRON_SECRET?.trim()
const baseUrl = normalizeUrl(options.baseUrl || process.env.M6_BASE_URL)
const inboundDomain = normalizeDomain(
  options.inboundDomain || process.env.M6_INBOUND_DOMAIN || process.env.SUPPORT_INBOUND_DOMAIN
)

if (options.strict) {
  record('RESEND_WEBHOOK_SECRET', webhookSecret ? 'pass' : 'fail', webhookSecret ? 'present' : 'missing')
  record('CRON_SECRET', cronSecret ? 'pass' : 'fail', cronSecret ? 'present' : 'missing')
  record('M6 base URL', baseUrl ? 'pass' : 'fail', baseUrl || 'missing or not HTTPS')
  record(
    'M6 managed inbound domain',
    inboundDomain?.endsWith('.resend.app') ? 'pass' : 'fail',
    inboundDomain || 'missing'
  )
} else {
  record('RESEND_WEBHOOK_SECRET', webhookSecret ? 'pass' : 'warn', webhookSecret ? 'present' : 'not loaded locally')
  record('CRON_SECRET', cronSecret ? 'pass' : 'warn', cronSecret ? 'present' : 'not loaded locally')
  record('M6 base URL', baseUrl ? 'pass' : 'warn', baseUrl || 'supply --base-url after deployment')
  record(
    'M6 managed inbound domain',
    inboundDomain?.endsWith('.resend.app') ? 'pass' : 'warn',
    inboundDomain || 'supply --inbound-domain from Resend Receiving'
  )
}

if (supabaseUrl && serviceKey) {
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  for (const [name, query] of [
    ['M5 webhook ledger schema', 'resend_webhook_events?select=webhook_event_id,event_type,processing_status&limit=0'],
    ['M5 provider lifecycle schema', 'email_events?select=email_event_id,provider_delivery_status,provider_event_type,provider_event_at&limit=0'],
  ]) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${query}`, { headers })
      record(name, response.ok ? 'pass' : 'fail', `HTTP ${response.status}`)
    } catch (error) {
      record(name, 'fail', error instanceof Error ? error.message : 'request failed')
    }
  }
}

try {
  const records = await resolveMx('ymistory.com')
  const unchanged =
    records.length === 1 &&
    records[0].priority === 5 &&
    normalizeDomain(records[0].exchange) === 'mail.ymistory.com'
  record(
    'Root MX remains on Webmail',
    unchanged ? 'pass' : 'fail',
    records.map((record) => `${record.priority} ${normalizeDomain(record.exchange)}`).join(', ')
  )
} catch (error) {
  record('Root MX remains on Webmail', 'fail', error instanceof Error ? error.message : 'DNS lookup failed')
}

if (resendApiKey) {
  const headers = { authorization: `Bearer ${resendApiKey}` }
  try {
    const [{ response: domainsResponse, data: domains }, { response: hooksResponse, data: hooks }] =
      await Promise.all([
        requestJson('https://api.resend.com/domains', { headers }),
        requestJson('https://api.resend.com/webhooks', { headers }),
      ])
    if (!domainsResponse.ok || !hooksResponse.ok) throw new Error('Resend inventory request failed')

    const rootDomain = (domains?.data || []).find((domain) => domain.name === 'ymistory.com')
    if (!rootDomain) {
      record('Resend root domain', 'fail', 'ymistory.com is missing')
    } else {
      const { response, data } = await requestJson(
        `https://api.resend.com/domains/${rootDomain.id}`,
        { headers }
      )
      if (!response.ok) throw new Error('Resend domain detail request failed')
      record(
        'Resend root receiving remains disabled',
        data?.capabilities?.receiving === 'disabled' ? 'pass' : 'fail',
        String(data?.capabilities?.receiving || 'unknown')
      )
      record(
        'Sensitive email tracking remains disabled',
        data?.open_tracking === false && data?.click_tracking === false ? 'pass' : 'fail',
        `open=${Boolean(data?.open_tracking)}, click=${Boolean(data?.click_tracking)}`
      )
    }

    const webhooks = hooks?.data || []
    if (webhooks.length === 0) {
      record('Single Resend webhook', options.strict ? 'fail' : 'warn', 'not registered yet')
    } else if (webhooks.length !== 1) {
      record('Single Resend webhook', 'fail', `${webhooks.length} endpoints registered`)
    } else {
      const webhook = webhooks[0]
      const events = new Set(webhook.events || [])
      const missing = REQUIRED_WEBHOOK_EVENTS.filter((event) => !events.has(event))
      const trackingEnabled = events.has('email.opened') || events.has('email.clicked')
      const expectedEndpoint = baseUrl ? `${baseUrl}/api/webhooks/resend` : null
      record(
        'Single Resend webhook',
        webhook.status === 'enabled' && missing.length === 0 && !trackingEnabled ? 'pass' : 'fail',
        missing.length > 0 ? `missing ${missing.join(', ')}` : trackingEnabled ? 'open/click selected' : 'enabled'
      )
      if (expectedEndpoint) {
        record(
          'Webhook endpoint target',
          webhook.endpoint === expectedEndpoint ? 'pass' : 'fail',
          webhook.endpoint === expectedEndpoint ? 'matches deployment' : 'does not match deployment'
        )
      }
    }
  } catch (error) {
    record('Resend provider inventory', 'fail', error instanceof Error ? error.message : 'request failed')
  }
}

if (baseUrl) {
  try {
    const [webhookRoute, recoveryRoute] = await Promise.all([
      fetch(`${baseUrl}/api/webhooks/resend`, { redirect: 'manual' }),
      fetch(`${baseUrl}/api/internal/email/inbound/process`, { redirect: 'manual' }),
    ])
    record('Deployed unified webhook route', webhookRoute.status === 405 ? 'pass' : 'fail', `HTTP ${webhookRoute.status}`)
    record('Recovery endpoint fails closed', recoveryRoute.status === 401 ? 'pass' : 'fail', `HTTP ${recoveryRoute.status}`)
  } catch (error) {
    record('Deployed route probes', 'fail', error instanceof Error ? error.message : 'request failed')
  }
}

const failed = checks.filter((check) => check.status === 'fail').length
const warnings = checks.filter((check) => check.status === 'warn').length
console.log(`\nM6 preflight: ${checks.length - failed - warnings} passed, ${warnings} warning(s), ${failed} failed.`)
if (failed > 0) process.exitCode = 1
