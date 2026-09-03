'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { AdminButton, AdminNotice, AdminPanel } from '@/components/admin/AdminUi'
import {
  DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  type CustomizeAccessSettings,
} from '@/lib/customize-access'

function normalizeSettings(value: unknown): CustomizeAccessSettings {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: Boolean(input.enabled ?? true),
    message: String(input.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE),
  }
}

export function CustomizeAccessControl() {
  const [settings, setSettings] = useState<CustomizeAccessSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestIntentRef = useRef(0)

  const loadSettings = useCallback(async () => {
    const intentId = ++requestIntentRef.current
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/customize-access', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (intentId !== requestIntentRef.current) return
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load customize access')
      }
      setSettings(normalizeSettings(data?.customizeAccess))
    } catch (loadError) {
      if (intentId !== requestIntentRef.current) return
      setSettings(null)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load customize access')
    } finally {
      if (intentId === requestIntentRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
    return () => {
      requestIntentRef.current += 1
    }
  }, [loadSettings])

  const toggleAccess = async () => {
    if (!settings || saving) return
    const intentId = ++requestIntentRef.current
    const previous = settings
    const intendedEnabled = !previous.enabled

    setSettings({ ...previous, enabled: intendedEnabled })
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/admin/customize-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: intendedEnabled }),
      })
      const data = await response.json().catch(() => ({}))
      if (intentId !== requestIntentRef.current) return
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update customize access')
      }

      const persisted = normalizeSettings(data?.customizeAccess)
      setSettings(persisted)
      setMessage(`Customize access ${persisted.enabled ? 'opened' : 'closed'}.`)
    } catch (saveError) {
      if (intentId !== requestIntentRef.current) return
      setSettings(previous)
      setError(saveError instanceof Error ? saveError.message : 'Failed to update customize access')
    } finally {
      if (intentId === requestIntentRef.current) setSaving(false)
    }
  }

  return (
    <AdminPanel className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">Access Control</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">Customize access</h2>
        </div>

        {settings ? (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void toggleAccess()}
              disabled={saving}
              aria-pressed={settings.enabled}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                settings.enabled
                  ? 'border border-[#b9dec8] bg-[#e7f5ec] text-[#237044] hover:bg-[#dcefe4]'
                  : 'border border-[#d9ddd6] bg-[#f1f3ef] text-[#646960] hover:bg-white'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${settings.enabled ? 'bg-[#3e8c5c]' : 'bg-[#8d928a]'}`} />
              {saving ? 'Saving...' : settings.enabled ? 'Open - Close access' : 'Closed - Open access'}
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="admin-v2-data-row mt-5 h-20 animate-pulse">
          <span className="sr-only">Loading Customize access</span>
        </div>
      ) : settings ? (
        <div className="admin-v2-data-row mt-5 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">Blocked message preview</p>
          <p className="mt-1.5 text-sm leading-7 text-[#4e534c]">{settings.message}</p>
        </div>
      ) : (
        <AdminButton
          type="button"
          onClick={() => void loadSettings()}
          className="mt-5"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Retry
        </AdminButton>
      )}

      {error ? <AdminNotice tone="danger" className="mt-4">{error}</AdminNotice> : null}
      {message ? <AdminNotice tone="success" className="mt-4">{message}</AdminNotice> : null}
    </AdminPanel>
  )
}
