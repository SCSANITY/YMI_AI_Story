'use client'

import { useMemo } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { getUiMessage } from '@/lib/i18n-messages'

type Vars = Record<string, string | number | null | undefined>

export function useI18n() {
  const { language } = useGlobalContext()

  return useMemo(
    () => ({
      language,
      t: (key: string, vars?: Vars) => getUiMessage(language, key, vars),
    }),
    [language]
  )
}
