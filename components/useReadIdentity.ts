'use client'

import { useGlobalContext } from '@/contexts/GlobalContext'

export function useReadIdentity() {
  return useGlobalContext().readIdentity
}
