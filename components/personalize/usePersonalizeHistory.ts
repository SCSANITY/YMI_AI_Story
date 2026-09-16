'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SignatureVoiceSpeakerKind } from '@/lib/signature-voice'
import type { UserTextProfile } from '@/lib/user-profile-history'
import type { RecentFaceItem } from '@/components/personalize/RecentFacesStrip'

export type RecentVoiceItem = {
  asset_id: string
  storage_path?: string | null
  playback_url?: string | null
  metadata?: {
    duration_seconds?: number | null
    speaker_kind?: SignatureVoiceSpeakerKind | null
  }
}

type UserAssetsResponse = {
  faces?: RecentFaceItem[]
  profiles?: UserTextProfile[]
  voices?: RecentVoiceItem[]
}

export function usePersonalizeHistory({
  customerId,
  enabled,
}: {
  customerId?: string | null
  enabled: boolean
}) {
  const [recentFaces, setRecentFaces] = useState<RecentFaceItem[]>([])
  const [recentProfiles, setRecentProfiles] = useState<UserTextProfile[]>([])
  const [recentVoices, setRecentVoices] = useState<RecentVoiceItem[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [loadedOwnerKey, setLoadedOwnerKey] = useState<string | null>(null)
  const ownerKey = customerId ? `customer:${customerId}` : 'anonymous-session'

  const refresh = useCallback(async (options?: { signal?: AbortSignal }) => {
    const params = customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''
    const response = await fetch(`/api/user-assets${params}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: options?.signal,
    })
    if (!response.ok) {
      setLoadedOwnerKey(ownerKey)
      setStatus('error')
      throw new Error('Failed to load personalization history')
    }

    const data = await response.json() as UserAssetsResponse
    setRecentFaces(Array.isArray(data.faces) ? data.faces : [])
    setRecentProfiles(Array.isArray(data.profiles) ? data.profiles : [])
    setRecentVoices(Array.isArray(data.voices) ? data.voices : [])
    setLoadedOwnerKey(ownerKey)
    setStatus('ready')
  }, [customerId, ownerKey])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    void Promise.resolve()
      .then(() => refresh({ signal: controller.signal }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.warn('Failed to load personalization history:', error)
      })

    return () => controller.abort()
  }, [enabled, refresh])

  const rememberProfile = useCallback((profile?: UserTextProfile | null) => {
    if (!profile?.asset_id) return
    setRecentProfiles((current) => [
      profile,
      ...current.filter((item) => item.asset_id !== profile.asset_id),
    ].slice(0, 5))
  }, [])

  const forgetFace = useCallback((assetId: string) => {
    setRecentFaces((current) => current.filter((face) => face.asset_id !== assetId))
  }, [])

  const forgetProfile = useCallback((payload: {
    assetId?: string
    field?: 'name' | 'age'
    value?: string | number
  }) => {
    if (payload.assetId) {
      setRecentProfiles((current) => current.filter((profile) => profile.asset_id !== payload.assetId))
      return
    }
    if (!payload.field || payload.value === undefined || payload.value === null) return

    const targetValue = String(payload.value)
    setRecentProfiles((current) => current.flatMap((profile) => {
      const metadata = { ...(profile.metadata ?? {}) }
      const nameValue = metadata.name ?? metadata.child_name
      const ageValue = metadata.age ?? metadata.child_age

      if (payload.field === 'name' && String(nameValue ?? '') === targetValue) {
        delete metadata.name
        delete metadata.child_name
      }
      if (payload.field === 'age' && String(ageValue ?? '') === targetValue) {
        delete metadata.age
        delete metadata.child_age
      }

      const hasName = String(metadata.name ?? metadata.child_name ?? '').length > 0
      const hasAge = String(metadata.age ?? metadata.child_age ?? '').length > 0
      return hasName || hasAge ? [{ ...profile, metadata }] : []
    }))
  }, [])

  return {
    recentFaces: loadedOwnerKey === ownerKey ? recentFaces : [],
    recentProfiles: loadedOwnerKey === ownerKey ? recentProfiles : [],
    recentVoices: loadedOwnerKey === ownerKey ? recentVoices : [],
    status: loadedOwnerKey === ownerKey ? status : enabled ? 'loading' : 'idle',
    refresh,
    rememberProfile,
    forgetFace,
    forgetProfile,
  }
}
