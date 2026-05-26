export type CustomizeAccessSettings = {
  enabled: boolean
  message: string
}

export const CUSTOMIZE_ACCESS_SETTING_KEY = 'customize_access'
export const CUSTOMIZE_ACCESS_BLOCKED_EVENT = 'ymi:open-customize-access-blocked'
export const DEFAULT_CUSTOMIZE_ACCESS_MESSAGE =
  'YMI Story is currently in private beta. Our service window is 11AM-7PM (HongKong time). Please come back during this time. Thank you for your patience!'

export function normalizeCustomizeAccessSettings(value: unknown): CustomizeAccessSettings {
  if (!value || typeof value !== 'object') {
    return {
      enabled: true,
      message: DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
    }
  }

  const candidate = value as Partial<CustomizeAccessSettings>
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : true
  const message = typeof candidate.message === 'string' && candidate.message.trim()
    ? candidate.message.trim()
    : DEFAULT_CUSTOMIZE_ACCESS_MESSAGE

  return { enabled, message }
}

export function buildCustomizeAccessSettings(input?: Partial<CustomizeAccessSettings> | null): CustomizeAccessSettings {
  return normalizeCustomizeAccessSettings({
    enabled: input?.enabled ?? true,
    message: input?.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  })
}
