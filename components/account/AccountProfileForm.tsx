'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Loader2, Sparkles, UserRound } from 'lucide-react'
import { Button } from '@/components/Button'
import type { User } from '@/types'

type AccountProfileFormProps = {
  user: User
  resolvedAvatar: string
  initialDisplayName: string
  avatarError: string
  error: string
  isSaving: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSave: (displayName: string) => Promise<boolean>
  onReset: () => void
}

export function AccountProfileForm({
  user,
  resolvedAvatar,
  initialDisplayName,
  avatarError,
  error,
  isSaving,
  t,
  onFileChange,
  onSave,
  onReset,
}: AccountProfileFormProps) {
  const [draftDisplayName, setDraftDisplayName] = useState(initialDisplayName)
  const draftDisplayNameRef = useRef(initialDisplayName)
  const hasLocalEditsRef = useRef(false)

  useEffect(() => {
    if (hasLocalEditsRef.current) return
    setDraftDisplayName(initialDisplayName)
    draftDisplayNameRef.current = initialDisplayName
  }, [initialDisplayName])

  const handleReset = () => {
    hasLocalEditsRef.current = false
    draftDisplayNameRef.current = initialDisplayName
    setDraftDisplayName(initialDisplayName)
    onReset()
  }

  const handleDisplayNameChange = (value: string) => {
    hasLocalEditsRef.current = true
    draftDisplayNameRef.current = value
    setDraftDisplayName(value)
  }

  const handleSave = async () => {
    const submittedDisplayName = draftDisplayName
    const saved = await onSave(submittedDisplayName)
    if (!saved || draftDisplayNameRef.current !== submittedDisplayName) return
    hasLocalEditsRef.current = false
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-amber-500 sm:tracking-[0.22em]">{t('account.profileDetails')}</p>
          <h2 className="mt-2 break-words text-2xl font-semibold text-slate-900 sm:text-3xl">{t('account.customizeAppearanceTitle')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {t('account.customizeAppearanceDescription')}
          </p>
        </div>
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800 sm:px-4">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{t('account.syncedHint')}</span>
        </div>
      </div>

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <UserRound className="h-12 w-12" />
              </div>
            )}
          </div>

          <label className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-3 text-center text-sm font-medium leading-5 text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
            <Camera className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 break-words">{t('account.uploadAvatar')}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onFileChange}
            />
          </label>

          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            {t('account.avatarHint')}
          </p>

          {avatarError ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-medium leading-5 text-rose-700">
              {avatarError}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <label htmlFor="account-display-name" className="text-sm font-medium text-slate-700">
              {t('account.displayNameLabel')}
            </label>
            <input
              id="account-display-name"
              type="text"
              value={draftDisplayName}
              onChange={(event) => handleDisplayNameChange(event.target.value)}
              className="h-13 w-full rounded-[1.4rem] border border-slate-200 bg-white px-5 text-base text-slate-900 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              placeholder={t('account.displayNamePlaceholder')}
              maxLength={40}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{t('account.emailLabel')}</label>
            <div className="flex min-h-[3.25rem] items-center break-all rounded-[1.4rem] border border-slate-200 bg-slate-50 px-5 py-3 text-base text-slate-500">
              {user.email}
            </div>
          </div>

          {error ? (
            <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
            <Button type="button" className="h-auto min-h-10 whitespace-normal px-5 py-2 text-center" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                  <span className="min-w-0 break-words">{t('account.saving')}</span>
                </>
              ) : (
                <span className="min-w-0 break-words">{t('account.saveChanges')}</span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 whitespace-normal px-5 py-2 text-center"
              onClick={handleReset}
              disabled={isSaving}
            >
              {t('account.reset')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
