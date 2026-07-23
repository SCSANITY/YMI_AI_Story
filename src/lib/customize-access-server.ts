import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  buildCustomizeAccessSettings,
  CUSTOMIZE_ACCESS_SETTING_KEY,
  DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  normalizeCustomizeAccessSettings,
  type CustomizeAccessSettings,
} from '@/lib/customize-access'

type AdminSettingsRow = {
  setting_key: string
  setting_value: unknown
  updated_by: string | null
  updated_at: string | null
}

async function loadCustomizeAccessRow() {
  const { data, error } = await supabaseAdmin
    .from('admin_settings')
    .select('setting_key, setting_value, updated_by, updated_at')
    .eq('setting_key', CUSTOMIZE_ACCESS_SETTING_KEY)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as AdminSettingsRow | null) ?? null
}

export async function getCustomizeAccessSettings(options?: {
  failOnError?: boolean
}): Promise<CustomizeAccessSettings> {
  const row = options?.failOnError
    ? await loadCustomizeAccessRow()
    : await loadCustomizeAccessRow().catch(() => null)
  if (!row) {
    return buildCustomizeAccessSettings()
  }

  return normalizeCustomizeAccessSettings(row.setting_value)
}

export async function setCustomizeAccessEnabled(enabled: boolean, updatedBy?: string | null) {
  const current = await getCustomizeAccessSettings({ failOnError: true })
  const next = buildCustomizeAccessSettings({
    enabled: Boolean(enabled),
    message: current.message || DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  })

  const { error } = await supabaseAdmin.from('admin_settings').upsert({
    setting_key: CUSTOMIZE_ACCESS_SETTING_KEY,
    setting_value: next,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    throw error
  }

  return next
}
