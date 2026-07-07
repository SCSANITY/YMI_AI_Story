'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/Button'

type SupportOrderMessageSectionProps = {
  t: (key: string, params?: Record<string, string | number>) => string
}

export function SupportOrderMessageSection({ t }: SupportOrderMessageSectionProps) {
  const [message, setMessage] = useState('')

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">{t('supportDetail.tellUs')}</h2>
      <textarea
        className="min-h-[140px] w-full rounded-xl border border-gray-200 p-3 text-sm"
        placeholder={t('supportDetail.placeholder')}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <Button size="sm" className="rounded-full px-6">
        <Send className="mr-2 h-4 w-4" /> {t('supportDetail.submitDemo')}
      </Button>
    </div>
  )
}
