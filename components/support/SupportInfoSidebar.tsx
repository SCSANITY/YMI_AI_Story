type SupportInfoSidebarProps = {
  t: (key: string, params?: Record<string, string | number>) => string
}

export function SupportInfoSidebar({ t }: SupportInfoSidebarProps) {
  return (
    <aside className="space-y-4">
      <div className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_18px_48px_rgba(146,64,14,0.08)] backdrop-blur-xl">
        <h2 className="text-lg font-bold text-gray-950">{t('support.sideTitle')}</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">{t('support.sideDescription')}</p>
      </div>
      <div className="rounded-[28px] border border-amber-100 bg-amber-50/55 p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-amber-700">
          {t('support.emailNoticeTitle')}
        </h3>
        <p className="mt-3 text-sm leading-6 text-gray-600">{t('support.emailNotice')}</p>
      </div>
    </aside>
  )
}
