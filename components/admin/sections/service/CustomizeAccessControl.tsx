'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
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
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Access Control</p>
          <h2 className="mt-1 text-xl font-bold text-white">Customize access</h2>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
            Block new Customize sessions during private beta windows.
          </p>
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
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${settings.enabled ? 'bg-white' : 'bg-slate-400'}`} />
              {saving ? 'Saving...' : settings.enabled ? 'Open - Close access' : 'Closed - Open access'}
            </button>
            <p className="text-[10px] text-slate-500">
              {settings.enabled ? 'Users can enter Customize.' : 'Users see the private beta notice.'}
            </p>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="mt-5 h-20 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.04]">
          <span className="sr-only">Loading Customize access</span>
        </div>
      ) : settings ? (
        <div className="mt-5 rounded-lg border border-white/[0.07] bg-black/15 px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Blocked message preview</p>
          <p className="mt-1.5 text-sm leading-7 text-slate-300">{settings.message}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Retry
        </button>
      )}

      {error ? <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm text-emerald-200">{message}</p> : null}
    </section>
  )
}
