'use client'

import { useI18n } from '@/lib/useI18n'

export default function MaintenancePage() {
  const { t } = useI18n()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_38%),linear-gradient(180deg,_#fffdf8_0%,_#fff7ed_100%)] px-4 py-16 text-gray-900">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[32px] border border-amber-100 bg-white/90 p-8 text-center shadow-[0_24px_80px_rgba(217,119,6,0.10)] backdrop-blur md:p-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-semibold text-amber-700">
            Y
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">
            {t('maintenance.badge')}
          </p>
          <h1 className="mt-4 font-title text-4xl text-gray-900 md:text-5xl">
            {t('maintenance.title')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
            {t('maintenance.description')}
          </p>
          <div className="mt-8 rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 text-sm text-amber-900">
            {t('maintenance.contactPrefix')}{' '}
            <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="mailto:admin@ymistory.com">
              admin@ymistory.com
            </a>
            {t('maintenance.contactSuffix')}
          </div>
        </section>
      </div>
    </main>
  )
}
