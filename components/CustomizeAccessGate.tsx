'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { canEnterCustomize } from '@/lib/customize-access-client'

export function CustomizeAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    let active = true

    const checkAccess = async () => {
      const allowed = await canEnterCustomize({ force: true })
      if (!active) return

      if (!allowed) {
        router.replace('/books')
      }
    }

    void checkAccess()

    return () => {
      active = false
    }
  }, [router])

  return <>{children}</>
}
