export const GENERAL_MAILBOX_DEFINITIONS = [
  {
    key: 'admin',
    displayName: 'Admin',
    localPart: 'admin',
    senderEnvName: 'EMAIL_FROM_ADMIN',
    inboundAliases: ['postmaster', 'abuse'],
  },
  {
    key: 'hello',
    displayName: 'Hello',
    localPart: 'hello',
    senderEnvName: 'EMAIL_FROM',
    inboundAliases: [],
  },
  {
    key: 'security',
    displayName: 'Security',
    localPart: 'security',
    senderEnvName: 'EMAIL_FROM_SECURITY',
    inboundAliases: [],
  },
  {
    key: 'orders',
    displayName: 'Orders',
    localPart: 'orders',
    senderEnvName: 'EMAIL_FROM_ORDERS',
    inboundAliases: [],
  },
  {
    key: 'delivery',
    displayName: 'Delivery',
    localPart: 'delivery',
    senderEnvName: 'EMAIL_FROM_DELIVERY',
    inboundAliases: [],
  },
] as const

export type GeneralMailboxKey = (typeof GENERAL_MAILBOX_DEFINITIONS)[number]['key']
export type GeneralMailboxDefinition = (typeof GENERAL_MAILBOX_DEFINITIONS)[number]

export const GENERAL_OPERATIONAL_LOCAL_PARTS = ['orders', 'delivery'] as const
export const GENERAL_INBOUND_LOCAL_PARTS = [
  'admin',
  'hello',
  'security',
  'postmaster',
  'abuse',
] as const

const mailboxByLocalPart = new Map<string, GeneralMailboxDefinition>(
  GENERAL_MAILBOX_DEFINITIONS.flatMap((mailbox) => [
    [mailbox.localPart, mailbox] as const,
    ...mailbox.inboundAliases.map((alias) => [alias, mailbox] as const),
  ])
)

export function getGeneralMailboxDefinition(key: GeneralMailboxKey) {
  return GENERAL_MAILBOX_DEFINITIONS.find((mailbox) => mailbox.key === key) ?? null
}

export function isGeneralMailboxKey(value: unknown): value is GeneralMailboxKey {
  return GENERAL_MAILBOX_DEFINITIONS.some((mailbox) => mailbox.key === value)
}

export function buildGeneralMailboxAddress(key: GeneralMailboxKey, inboundDomain: string) {
  const mailbox = getGeneralMailboxDefinition(key)
  if (!mailbox) throw new Error(`General Inbox mailbox is not configured: ${key}`)
  return `${mailbox.localPart}@${inboundDomain.trim().toLowerCase()}`
}

export function listGeneralMailboxInboundAddresses(inboundDomain: string) {
  const domain = inboundDomain.trim().toLowerCase()
  return GENERAL_MAILBOX_DEFINITIONS.flatMap((mailbox) => [
    `${mailbox.localPart}@${domain}`,
    ...mailbox.inboundAliases.map((alias) => `${alias}@${domain}`),
  ])
}

export function resolveGeneralMailboxFromLocalPart(localPart: string) {
  return mailboxByLocalPart.get(localPart.trim().toLowerCase()) ?? null
}
