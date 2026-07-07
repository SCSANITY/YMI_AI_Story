'use client'

import { Headphones } from 'lucide-react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { SupportInfoSidebar } from '@/components/support/SupportInfoSidebar'
import { SupportQuestionSection } from '@/components/support/SupportQuestionSection'

export default function SupportPage() {
  const { t } = useI18n()
  const { user, openLoginModal } = useGlobalContext()

  return (
    <div className="page-surface min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <Headphones className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="font-title text-2xl text-gray-900 md:text-3xl">{t('support.title')}</h1>
            <p className="text-sm text-gray-500">{t('support.subtitle')}</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SupportQuestionSection user={user} openLoginModal={openLoginModal} t={t} />
          <SupportInfoSidebar t={t} />
        </div>
      </div>
    </div>
  )
}
