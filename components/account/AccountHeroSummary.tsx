import { UserRound } from 'lucide-react'
import type { User } from '@/types'

type AccountHeroSummaryProps = {
  user: User
  resolvedAvatar: string
  rewardCount: number
  favoritesCount: number
  cartCount: number
  t: (key: string, params?: Record<string, string | number>) => string
}

export function AccountHeroSummary({
  user,
  resolvedAvatar,
  rewardCount,
  favoritesCount,
  cartCount,
  t,
}: AccountHeroSummaryProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.96))] shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
      <div className="grid gap-6 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:h-24 sm:w-24">
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <UserRound className="h-9 w-9" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-amber-500 sm:tracking-[0.24em]">{t('account.centerBadge')}</p>
            <h1 className="mt-2 break-words font-title text-3xl leading-tight text-slate-900 sm:text-4xl">{user.name}</h1>
            <p className="mt-2 break-all text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 sm:tracking-[0.16em]">{t('account.statsRewards')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{rewardCount}</p>
          </div>
          <div className="min-w-0 rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 sm:tracking-[0.16em]">{t('account.statsFavorites')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{favoritesCount}</p>
          </div>
          <div className="min-w-0 rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 sm:tracking-[0.16em]">{t('account.statsCart')}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{cartCount}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
