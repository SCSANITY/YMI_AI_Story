'use client'

import { ShieldCheck } from 'lucide-react'

export const PRIVACY_REASSURANCE_COPY = 'Private and secure. No third-party reuse.'

export function PrivacyReassurance() {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-600">
      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>{PRIVACY_REASSURANCE_COPY}</span>
    </p>
  )
}
