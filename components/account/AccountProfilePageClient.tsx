'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Camera,
  ChevronRight,
  Gift,
  Heart,
  Headphones,
  Loader2,
  Package,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { MyRewardsModal } from '@/components/MyRewardsModal'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type RewardVoucherSummary = {
  active: Array<{ couponCodeId: string }>
}

export function AccountProfilePageClient() {
  const router = useRouter()
  const { t } = useI18n()
  const {
    user,
    cart,
    favorites,
    isHydrated,
    openLoginModal,
    refreshUserProfile,
  } = useGlobalContext()

  const [displayName, setDisplayName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRewardsOpen, setRewardsOpen] = useState(false)
  const [rewardCount, setRewardCount] = useState(0)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.name || '')
    setSelectedFile(null)
    setPreviewUrl(null)
    setError('')
  }, [user])

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  useEffect(() => {
    if (!user?.customerId) {
      setRewardCount(0)
      return
    }

    let cancelled = false

    fetch('/api/account/reward-vouchers', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : { active: [] }))
      .then((data: RewardVoucherSummary) => {
        if (cancelled) return
        setRewardCount(Array.isArray(data?.active) ? data.active.length : 0)
      })
      .catch(() => {
        if (cancelled) return
        setRewardCount(0)
      })

    return () => {
      cancelled = true
    }
  }, [isRewardsOpen, user?.customerId])

  const resolvedAvatar = useMemo(
    () => previewUrl || user?.avatar || '/default-avatar.svg',
    [previewUrl, user?.avatar]
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError(t('account.errorAvatarType'))
      return
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError(t('account.errorAvatarSize'))
      return
    }

    setError('')
    setSelectedFile(file)
  }

  const handleSave = async () => {
    if (!user?.customerId) return

    const trimmedName = displayName.trim()
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError(t('account.errorDisplayNameLength'))
      return
    }

    setError('')
    setIsSaving(true)

    try {
      let avatarAssetId: string | undefined
      let avatarStoragePath: string | undefined

      if (selectedFile) {
        const avatarAsset = await uploadUserAsset(selectedFile, 'profile_avatar', 'avatar', user.customerId)
        avatarAssetId = avatarAsset.asset_id
        avatarStoragePath = avatarAsset.storage_path
      }

      const response = await fetch('/api/user/account-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: trimmedName,
          ...(avatarAssetId && avatarStoragePath
            ? { avatarAssetId, avatarStoragePath }
            : {}),
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || t('account.errorUpdateFailed'))
      }

      await refreshUserProfile()
      setSelectedFile(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('account.errorUpdateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isHydrated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-slate-500">{t('account.loading')}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[70vh] px-4 py-12">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/70 bg-white/85 p-8 text-center shadow-[0_20px_70px_rgba(15,23,42,0.1)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">{t('account.centerBadge')}</p>
          <h1 className="mt-4 font-title text-4xl text-slate-900">{t('account.signInTitle')}</h1>
          <p className="mt-4 text-base text-slate-600">
            {t('account.signInDescription')}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button onClick={() => openLoginModal('login')}>{t('navbar.logIn')}</Button>
            <Button variant="outline" onClick={() => router.push('/')}>{t('common.backToHome')}</Button>
          </div>
        </div>
      </div>
    )
  }

  const quickLinks = [
    {
      title: t('navbar.myRewards'),
      description: t('account.quickLinkRewardsDescription'),
      icon: Gift,
      action: () => setRewardsOpen(true),
      meta: rewardCount > 0 ? t('account.quickLinkRewardsMeta', { count: rewardCount > 9 ? '9+' : rewardCount }) : t('account.quickLinkRewardsEmpty'),
    },
    {
      title: t('navbar.myOrders'),
      description: t('account.quickLinkOrdersDescription'),
      icon: Package,
      action: () => router.push('/orders'),
      meta: t('account.quickLinkOrdersMeta'),
    },
    {
      title: t('navbar.myBooks'),
      description: t('account.quickLinkBooksDescription'),
      icon: BookOpen,
      action: () => router.push('/my-books'),
      meta: t('account.quickLinkBooksMeta'),
    },
    {
      title: t('navbar.favorites'),
      description: t('account.quickLinkFavoritesDescription'),
      icon: Heart,
      action: () => router.push('/favorites'),
      meta: t('account.quickLinkFavoritesMeta', { count: favorites.length }),
    },
    {
      title: t('navbar.support'),
      description: t('account.quickLinkSupportDescription'),
      icon: Headphones,
      action: () => router.push('/support'),
      meta: t('account.quickLinkSupportMeta'),
    },
  ]

  return (
    <div className="px-4 pb-14 pt-8 md:px-8 md:pt-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.96))] shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-8 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
            <div className="flex items-center gap-5">
              <div className="h-24 w-24 overflow-hidden rounded-full border border-white/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                {resolvedAvatar ? (
                  <img src={resolvedAvatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <UserRound className="h-9 w-9" />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">{t('account.centerBadge')}</p>
                <h1 className="mt-2 font-title text-4xl leading-tight text-slate-900">{user.name}</h1>
                <p className="mt-2 truncate text-sm text-slate-500">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('account.statsRewards')}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{rewardCount}</p>
              </div>
              <div className="rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('account.statsFavorites')}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{favorites.length}</p>
              </div>
              <div className="rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('account.statsCart')}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{cart.length}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_380px]">
          <section className="rounded-[2rem] border border-white/70 bg-white/88 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">{t('account.profileDetails')}</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-900">{t('account.customizeAppearanceTitle')}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  {t('account.customizeAppearanceDescription')}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
                <Sparkles className="h-4 w-4" />
                {t('account.syncedHint')}
              </div>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-5">
                <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
                  {resolvedAvatar ? (
                    <img src={resolvedAvatar} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <UserRound className="h-12 w-12" />
                    </div>
                  )}
                </div>

                <label className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
                  <Camera className="h-4 w-4 text-amber-600" />
                  {t('account.uploadAvatar')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                  {t('account.avatarHint')}
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="account-display-name" className="text-sm font-medium text-slate-700">
                    {t('account.displayNameLabel')}
                  </label>
                  <input
                    id="account-display-name"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="h-13 w-full rounded-[1.4rem] border border-slate-200 bg-white px-5 text-base text-slate-900 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder={t('account.displayNamePlaceholder')}
                    maxLength={40}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('account.emailLabel')}</label>
                  <div className="flex h-13 items-center rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 text-base text-slate-500">
                    {user.email}
                  </div>
                </div>

                {error ? (
                  <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button type="button" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('account.saving')}
                      </>
                    ) : (
                      t('account.saveChanges')
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDisplayName(user.name || '')
                      setSelectedFile(null)
                      setPreviewUrl(null)
                      setError('')
                    }}
                    disabled={isSaving}
                  >
                    {t('account.reset')}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-white/70 bg-white/88 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">{t('account.quickAccess')}</p>
              <div className="mt-5 space-y-3">
                {quickLinks.map(({ title, description, icon: Icon, action, meta }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={action}
                    className="flex w-full items-center gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/70"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                      <p className="mt-2 text-xs font-medium text-amber-700">{meta}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,250,235,0.95),rgba(255,255,255,0.95))] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">{t('account.comingNext')}</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">{t('account.hubTitle')}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t('account.hubDescription')}
              </p>
            </section>
          </aside>
        </div>
      </div>

      <MyRewardsModal open={isRewardsOpen} user={user} onClose={() => setRewardsOpen(false)} />
    </div>
  )
}
