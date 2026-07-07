'use client'

import { useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  Gift,
  Heart,
  Headphones,
  Loader2,
  Package,
} from 'lucide-react'

type AccountQuickLinksPanelProps = {
  rewardCount: number
  favoritesCount: number
  t: (key: string, params?: Record<string, string | number>) => string
  onOpenRewards: () => void
  onOpenOrders: () => void
  onOpenBooks: () => void
  onOpenFavorites: () => void
  onOpenSupport: () => void
}

export function AccountQuickLinksPanel({
  rewardCount,
  favoritesCount,
  t,
  onOpenRewards,
  onOpenOrders,
  onOpenBooks,
  onOpenFavorites,
  onOpenSupport,
}: AccountQuickLinksPanelProps) {
  const [pendingLink, setPendingLink] = useState<string | null>(null)

  const quickLinks = [
    {
      key: 'rewards',
      title: t('navbar.myRewards'),
      description: t('account.quickLinkRewardsDescription'),
      icon: Gift,
      action: onOpenRewards,
      routeAction: false,
      meta: rewardCount > 0 ? t('account.quickLinkRewardsMeta', { count: rewardCount > 9 ? '9+' : rewardCount }) : t('account.quickLinkRewardsEmpty'),
    },
    {
      key: 'orders',
      title: t('navbar.myOrders'),
      description: t('account.quickLinkOrdersDescription'),
      icon: Package,
      action: onOpenOrders,
      routeAction: true,
      meta: t('account.quickLinkOrdersMeta'),
    },
    {
      key: 'books',
      title: t('navbar.myBooks'),
      description: t('account.quickLinkBooksDescription'),
      icon: BookOpen,
      action: onOpenBooks,
      routeAction: true,
      meta: t('account.quickLinkBooksMeta'),
    },
    {
      key: 'favorites',
      title: t('navbar.favorites'),
      description: t('account.quickLinkFavoritesDescription'),
      icon: Heart,
      action: onOpenFavorites,
      routeAction: true,
      meta: t('account.quickLinkFavoritesMeta', { count: favoritesCount }),
    },
    {
      key: 'support',
      title: t('navbar.support'),
      description: t('account.quickLinkSupportDescription'),
      icon: Headphones,
      action: onOpenSupport,
      routeAction: true,
      meta: t('account.quickLinkSupportMeta'),
    },
  ]

  const handleQuickLink = (key: string, routeAction: boolean, action: () => void) => {
    if (pendingLink) return
    if (routeAction) setPendingLink(key)
    action()
  }

  return (
    <aside className="space-y-5">
      <section className="rounded-[2rem] border border-white/70 bg-white/88 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-amber-500 sm:tracking-[0.22em]">{t('account.quickAccess')}</p>
        <div className="mt-5 space-y-3">
          {quickLinks.map(({ key, title, description, icon: Icon, action, routeAction, meta }) => {
            const isPending = pendingLink === key
            return (
            <button
              key={key}
              type="button"
              onClick={() => handleQuickLink(key, routeAction, action)}
              disabled={Boolean(pendingLink)}
              className="flex w-full min-w-0 items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-3 py-4 text-left transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/70 sm:gap-4 sm:px-4"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-900">{title}</p>
                  {isPending ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-500" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">{description}</p>
                <p className="mt-2 break-words text-xs font-medium text-amber-700">{meta}</p>
              </div>
            </button>
          )})}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,250,235,0.95),rgba(255,255,255,0.95))] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-amber-500 sm:tracking-[0.22em]">{t('account.comingNext')}</p>
        <h3 className="mt-3 break-words text-xl font-semibold text-slate-900">{t('account.hubTitle')}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t('account.hubDescription')}
        </p>
      </section>
    </aside>
  )
}
