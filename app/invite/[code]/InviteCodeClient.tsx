'use client'

import { useEffect } from 'react'

export function InviteCodeClient({ code }: { code: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ymi_referral_code', code)
  }, [code])

  return null
}
