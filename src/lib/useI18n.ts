'use client'

import { getUiMessage } from '@/lib/i18n-messages'

type Vars = Record<string, string | number | null | undefined>

const englishUi = Object.freeze({
  t: (key: string, vars?: Vars) => getUiMessage(key, vars),
})

export function useI18n() {
  return englishUi
}
