'use client'

import React, { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  CUSTOMIZE_ACCESS_BLOCKED_EVENT,
  DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
} from '@/lib/customize-access'

type CustomizeAccessBlockedDetail = {
  message?: string
}

export function CustomizeAccessBlockedModal() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState(DEFAULT_CUSTOMIZE_ACCESS_MESSAGE)

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<CustomizeAccessBlockedDetail>
      const nextMessage = String(customEvent.detail?.message ?? '').trim()
      setMessage(nextMessage || DEFAULT_CUSTOMIZE_ACCESS_MESSAGE)
      setIsOpen(true)
    }

    window.addEventListener(CUSTOMIZE_ACCESS_BLOCKED_EVENT, handleOpen as EventListener)
    return () => window.removeEventListener(CUSTOMIZE_ACCESS_BLOCKED_EVENT, handleOpen as EventListener)
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px]"
        onClick={() => setIsOpen(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customize access blocked"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-[30px] border border-white/40 bg-white/80 shadow-[0_40px_100px_rgba(0,0,0,0.22)] backdrop-blur-3xl"
      >
        <div className="border-b border-black/8 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Lock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-700">Private Beta</p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">Customize is temporarily closed</h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <p className="text-sm leading-7 text-gray-700">{message}</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-black/8 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="h-10 rounded-full border border-amber-200/70 bg-white/60 px-5 text-sm font-semibold text-gray-700 transition hover:bg-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              router.push('/books')
            }}
            className="h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-orange-200/70 transition hover:-translate-y-0.5"
          >
            Browse Books
          </button>
        </div>
      </div>
    </div>
  )
}
