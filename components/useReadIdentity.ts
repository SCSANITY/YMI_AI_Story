'use client'

'use client'

import { useMemo } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'

export function useReadIdentity() {
  const context = useGlobalContext()
  return useMemo(() => {
    if (context.readIdentity !== undefined) return context.readIdentity
    if (context.user?.customerId) {
      return { key: `customer:${context.user.customerId}`, expectCustomer: true }
    }
    if (context.isAuthResolved === false) return null
    return { key: 'anon', expectCustomer: false }
  }, [context.readIdentity, context.isAuthResolved, context.user?.customerId])
}
