'use client'

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AccountHeroSummary } from '@/components/account/AccountHeroSummary'
import { AccountProfileForm } from '@/components/account/AccountProfileForm'
import { AccountQuickLinksPanel } from '@/components/account/AccountQuickLinksPanel'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'

const MyRewardsModal = dynamic(() => import('@/components/MyRewardsModal').then((module) => module.MyRewardsModal), {
  ssr: false,
  loading: () => null,
})

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type RewardVoucherSummary = {
  active: Array<{ couponCodeId: string }>
}

function AccountLoadingShell() {
  return (
    <div className="px-3 pb-14 pt-6 sm:px-4 md:px-8 md:pt-10" aria-label="Loading account">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.96))] shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-6 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-white/85 shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:h-24 sm:w-24" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-3 w-32 animate-pulse rounded-full bg-amber-100" />
                <div className="h-8 w-56 max-w-full animate-pulse rounded-full bg-slate-200" />
                <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                  <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100" />
                  <div className="mt-3 h-7 w-10 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_380px]">
          <section className="rounded-[2rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6 md:p-8">
            <div className="space-y-3">
              <div className="h-3 w-28 animate-pulse rounded-full bg-amber-100" />
              <div className="h-7 w-64 max-w-full animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-5">
                <div className="mx-auto h-40 w-40 animate-pulse rounded-[2rem] bg-white shadow-[0_14px_35px_rgba(15,23,42,0.08)]" />
                <div className="mt-5 h-12 animate-pulse rounded-full bg-amber-100/80" />
                <div className="mx-auto mt-3 h-3 w-32 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="h-4 w-28 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-13 animate-pulse rounded-[1.4rem] bg-white" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-13 animate-pulse rounded-[1.4rem] bg-slate-50" />
                </div>
                <div className="flex gap-3 pt-2">
                  <div className="h-10 w-32 animate-pulse rounded-full bg-amber-100/80" />
                  <div className="h-10 w-24 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-white/70 bg-white/88 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="h-3 w-28 animate-pulse rounded-full bg-amber-100" />
              <div className="mt-5 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-3 py-4">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-white" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-3 w-40 max-w-full animate-pulse rounded-full bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRewardsOpen, setRewardsOpen] = useState(false)
  const [rewardCount, setRewardCount] = useState(0)

  useEffect(() => {
    if (!user) return
    setSelectedFile(null)
    setPreviewUrl(null)
    setError('')
    setAvatarError('')
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
  }, [user?.customerId])

  const resolvedAvatar = useMemo(
    () => previewUrl || user?.avatar || '/default-avatar.svg',
    [previewUrl, user?.avatar]
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError(t('account.errorAvatarType'))
      return
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t('account.errorAvatarSize'))
      return
    }

    setAvatarError('')
    setError('')
    setSelectedFile(file)
  }

  const handleSave = async (displayName: string) => {
    if (!user?.customerId) return false

    const trimmedName = displayName.trim()
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError(t('account.errorDisplayNameLength'))
      return false
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
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('account.errorUpdateFailed'))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetProfileForm = () => {
    if (!user) return
    setSelectedFile(null)
    setPreviewUrl(null)
    setError('')
    setAvatarError('')
  }

  if (!isHydrated) {
    return <AccountLoadingShell />
  }

  if (!user) {
    return (
      <div className="min-h-[70vh] px-4 py-12">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/70 bg-white/85 p-6 text-center shadow-[0_20px_70px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-8">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-amber-500 sm:tracking-[0.24em]">{t('account.centerBadge')}</p>
          <h1 className="mt-4 break-words font-title text-3xl text-slate-900 sm:text-4xl">{t('account.signInTitle')}</h1>
          <p className="mt-4 text-base text-slate-600">
            {t('account.signInDescription')}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button className="h-auto min-h-10 whitespace-normal px-5 py-2 text-center" onClick={() => openLoginModal('login')}>{t('navbar.logIn')}</Button>
            <Button className="h-auto min-h-10 whitespace-normal px-5 py-2 text-center" variant="outline" onClick={() => router.push('/')}>{t('common.backToHome')}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pb-14 pt-6 sm:px-4 md:px-8 md:pt-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <AccountHeroSummary
          user={user}
          resolvedAvatar={resolvedAvatar}
          rewardCount={rewardCount}
          favoritesCount={favorites.length}
          cartCount={cart.length}
          t={t}
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_380px]">
          <AccountProfileForm
            user={user}
            resolvedAvatar={resolvedAvatar}
            initialDisplayName={user.name || ''}
            hasPendingAvatarChange={Boolean(selectedFile)}
            avatarError={avatarError}
            error={error}
            isSaving={isSaving}
            t={t}
            onFileChange={handleFileChange}
            onSave={handleSave}
            onReset={handleResetProfileForm}
          />

          <AccountQuickLinksPanel
            rewardCount={rewardCount}
            favoritesCount={favorites.length}
            t={t}
            onOpenRewards={() => setRewardsOpen(true)}
            onOpenOrders={() => router.push('/orders')}
            onOpenBooks={() => router.push('/my-books')}
            onOpenFavorites={() => router.push('/favorites')}
            onOpenSupport={() => router.push('/support')}
          />
        </div>
      </div>

      {isRewardsOpen ? (
        <MyRewardsModal open={isRewardsOpen} user={user} onClose={() => setRewardsOpen(false)} />
      ) : null}
    </div>
  )
}
