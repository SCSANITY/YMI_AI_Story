'use client'

import { getUiMessage } from '@/lib/i18n-messages'

type Vars = Record<string, string | number | null | undefined>

export function useI18n() {
  return {
    t: (key: string, vars?: Vars) => getUiMessage(key, vars),
  }
}
