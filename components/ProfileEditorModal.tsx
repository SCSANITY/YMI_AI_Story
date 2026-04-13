'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Camera, Loader2, UserRound, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { uploadUserAsset } from '@/services/assets'
import type { User } from '@/types'

type ProfileEditorModalProps = {
  open: boolean
  user: User | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  open,
  user,
  onClose,
  onSaved,
}) => {
  const [displayName, setDisplayName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setDisplayName(user.name || '')
    setSelectedFile(null)
    setPreviewUrl(null)
    setError('')
  }, [open, user])

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  const resolvedAvatar = useMemo(() => previewUrl || user?.avatar || '/default-avatar.svg', [previewUrl, user?.avatar])

  if (!open || !user?.customerId) return null

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Avatar image must be smaller than 5MB.')
      return
    }

    setError('')
    setSelectedFile(file)
  }

  const handleSave = async () => {
    const trimmedName = displayName.trim()
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setError('Display name must be between 2 and 40 characters.')
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
        throw new Error(data?.error || 'Failed to update profile.')
      }

      await onSaved()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/28 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/88 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          aria-label="Close profile editor"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">Account Profile</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Edit your profile</h2>
          <p className="mt-1 text-sm text-slate-500">Update the name and avatar shown in the navigation.</p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/70 bg-white shadow-sm">
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <UserRound className="h-8 w-8" />
              </div>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100">
            <Camera className="h-4 w-4" />
            Upload avatar
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        <div className="mt-6 space-y-2">
          <label htmlFor="profile-display-name" className="text-sm font-medium text-slate-700">
            Display name
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            placeholder="Your display name"
            maxLength={40}
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
