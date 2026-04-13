'use client'

import React, { useEffect, useState } from 'react'
import { Gift, Loader2, Ticket, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import type { User } from '@/types'

type RewardVoucher = {
  couponCodeId: string
  code: string
  amountUsd: number
  status: 'active' | 'redeemed' | 'expired' | 'cancelled'
  expiresAt: string
  redeemedAt?: string | null
}

type RewardVoucherGroups = {
  active: RewardVoucher[]
  redeemed: RewardVoucher[]
  expired: RewardVoucher[]
  cancelled?: RewardVoucher[]
}

type MyRewardsModalProps = {
  open: boolean
  user: User | null
  onClose: () => void
}

function VoucherSection({
  title,
  vouchers,
  emptyLabel,
  status,
}: {
  title: string
  vouchers: RewardVoucher[]
  emptyLabel: string
  status: 'active' | 'redeemed' | 'expired'
}) {
  const { t } = useI18n()

  return (
    <section className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</div>
      {vouchers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-3">
          {vouchers.map((voucher) => (
            <div
              key={voucher.couponCodeId}
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Ticket className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-900">$ {voucher.amountUsd.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">
                      {status === 'redeemed' && voucher.redeemedAt
                        ? t('rewards.redeemedOn', {
                            date: new Date(voucher.redeemedAt).toLocaleDateString(),
                          })
                        : t('rewards.expiresOn', {
                            date: new Date(voucher.expiresAt).toLocaleDateString(),
                          })}
                    </div>
                  </div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    status === 'redeemed'
                      ? 'bg-slate-100 text-slate-600'
                      : status === 'expired'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {status === 'redeemed'
                    ? t('rewards.redeemed')
                    : status === 'expired'
                      ? t('rewards.expired')
                      : t('rewards.active')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export const MyRewardsModal: React.FC<MyRewardsModalProps> = ({ open, user, onClose }) => {
  const { t } = useI18n()
  const [groups, setGroups] = useState<RewardVoucherGroups>({
    active: [],
    redeemed: [],
    expired: [],
    cancelled: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !user?.customerId) return

    let cancelled = false
    setLoading(true)
    setError('')

    fetch('/api/account/reward-vouchers', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : res.json().then((data) => Promise.reject(data))))
      .then((data) => {
        if (cancelled) return
        setGroups({
          active: Array.isArray(data?.active) ? data.active : [],
          redeemed: Array.isArray(data?.redeemed) ? data.redeemed : [],
          expired: Array.isArray(data?.expired) ? data.expired : [],
          cancelled: Array.isArray(data?.cancelled) ? data.cancelled : [],
        })
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(loadError?.error || t('rewards.loadFailed'))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, t, user?.customerId])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open || !user?.customerId) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/28 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div className="my-2 flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:my-0 sm:max-h-[calc(100dvh-3rem)]">
        <div className="sticky top-0 z-10 border-b border-white/70 bg-white/92 px-5 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="pr-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">{t('rewards.label')}</p>
            <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Gift className="h-6 w-6 text-amber-500" />
              {t('rewards.title')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t('rewards.subtitle')}</p>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('rewards.loading')}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              <VoucherSection
                title={t('rewards.active')}
                vouchers={groups.active}
                emptyLabel={t('rewards.emptyActive')}
                status="active"
              />
              <VoucherSection
                title={t('rewards.redeemed')}
                vouchers={groups.redeemed}
                emptyLabel={t('rewards.emptyRedeemed')}
                status="redeemed"
              />
              <VoucherSection
                title={t('rewards.expired')}
                vouchers={groups.expired}
                emptyLabel={t('rewards.emptyExpired')}
                status="expired"
              />
            </div>
          )}
        </div>

        <div className="border-t border-white/70 bg-white/90 px-5 py-4 sm:px-6">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
