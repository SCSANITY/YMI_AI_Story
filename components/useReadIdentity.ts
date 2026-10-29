'use client'

import { useMemo } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { resolveReadIdentity } from '@/lib/read-identity'

export function useReadIdentity() {
  const { isAuthResolved, user } = useGlobalContext()
  return useMemo(
    () => resolveReadIdentity(isAuthResolved, user?.customerId),
    [isAuthResolved, user?.customerId]
  )
}
