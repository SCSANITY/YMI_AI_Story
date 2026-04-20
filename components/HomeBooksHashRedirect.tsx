'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function HomeBooksHashRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (window.location.hash !== '#books') return

    const nextUrl = `/books${window.location.search || ''}`
    router.replace(nextUrl)
  }, [router])

  return null
}
