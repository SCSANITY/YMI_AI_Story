'use client'

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type RecentProfileItem = {
  asset_id: string
  metadata?: { child_name?: string; child_age?: number; name?: string; age?: number; gender?: string }
}

type ChildDetailsFieldsProps = {
  initialName: string
  initialAge: string
  seedVersion: number
  recentProfiles: RecentProfileItem[]
  labels: {
    nameLabel: string
    namePlaceholder: string
    ageLabel: string
    agePlaceholder: string
    noHistory: string
  }
  onLoadProfiles: () => void
  onChange: (details: { name: string; age: string }) => void
  onDeleteProfileValue: (payload: { field: 'name' | 'age'; value: string | number }) => void
  onFocusField?: () => void
}

function ChildDetailsFieldsComponent({
  initialName,
  initialAge,
  seedVersion,
  recentProfiles,
  labels,
  onLoadProfiles,
  onChange,
  onDeleteProfileValue,
  onFocusField,
}: ChildDetailsFieldsProps) {
  const [name, setName] = useState(initialName)
  const [age, setAge] = useState(initialAge)
  const [showNameHistory, setShowNameHistory] = useState(false)
  const [showAgeHistory, setShowAgeHistory] = useState(false)
  const nameBoxRef = useRef<HTMLDivElement | null>(null)
  const ageBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setName(initialName)
    setAge(initialAge)
    onChange({ name: initialName, age: initialAge })
  }, [initialAge, initialName, onChange, seedVersion])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (nameBoxRef.current?.contains(target) || ageBoxRef.current?.contains(target)) {
        return
      }
      setShowNameHistory(false)
      setShowAgeHistory(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const nameHistory = useMemo(() => (
    Array.from(
      new Set(
        recentProfiles
          .map((profile) => profile.metadata?.name ?? profile.metadata?.child_name)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value))
      )
    )
  ), [recentProfiles])

  const ageHistory = useMemo(() => (
    Array.from(
      new Set(
        recentProfiles
          .map((profile) => profile.metadata?.age ?? profile.metadata?.child_age)
          .filter((value): value is number => value !== undefined && value !== null)
          .map((value) => String(value))
      )
    )
  ), [recentProfiles])

  const handleNameChange = useCallback((value: string) => {
    setName(value)
    onChange({ name: value, age })
  }, [age, onChange])

  const handleAgeChange = useCallback((value: string) => {
    setAge(value)
    onChange({ name, age: value })
  }, [name, onChange])

  const openNameHistory = useCallback(() => {
    onLoadProfiles()
    onFocusField?.()
    setShowNameHistory(true)
    setShowAgeHistory(false)
  }, [onFocusField, onLoadProfiles])

  const openAgeHistory = useCallback(() => {
    onLoadProfiles()
    onFocusField?.()
    setShowAgeHistory(true)
    setShowNameHistory(false)
  }, [onFocusField, onLoadProfiles])

  const selectName = useCallback((value: string) => {
    setName(value)
    onChange({ name: value, age })
    setShowNameHistory(false)
  }, [age, onChange])

  const selectAge = useCallback((value: string) => {
    setAge(value)
    onChange({ name, age: value })
    setShowAgeHistory(false)
  }, [name, onChange])

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <div ref={nameBoxRef} className="space-y-2 relative">
        <label className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">{labels.nameLabel}</label>
        <input
          type="text"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          onFocus={openNameHistory}
          placeholder={labels.namePlaceholder}
          className="h-12 w-full rounded-2xl px-4 text-[15px] font-semibold text-slate-950 placeholder:text-slate-400/70 glass-input"
        />
        {showNameHistory && (
          <div
            className="absolute z-30 mt-2 w-full rounded-2xl border border-white/70 bg-white/92 backdrop-blur-xl shadow-[0_18px_44px_rgba(16,24,40,0.14)] p-2 max-h-44 overflow-auto"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {nameHistory.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">{labels.noHistory}</div>
            ) : (
              nameHistory.map((value) => (
                <div
                  key={value}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-amber-50 transition"
                >
                  <button
                    type="button"
                    className="flex-1 text-left text-sm text-gray-700"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectName(value)
                    }}
                  >
                    {value}
                  </button>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-500 transition"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteProfileValue({ field: 'name', value })
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div ref={ageBoxRef} className="space-y-2 relative">
        <label className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">{labels.ageLabel}</label>
        <input
          type="number"
          value={age}
          onChange={(event) => handleAgeChange(event.target.value)}
          onFocus={openAgeHistory}
          placeholder={labels.agePlaceholder}
          className="h-12 w-full rounded-2xl px-4 text-[15px] font-semibold text-slate-950 placeholder:text-slate-400/70 glass-input"
        />
        {showAgeHistory && (
          <div
            className="absolute z-30 mt-2 w-full rounded-2xl border border-white/70 bg-white/92 backdrop-blur-xl shadow-[0_18px_44px_rgba(16,24,40,0.14)] p-2 max-h-44 overflow-auto"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {ageHistory.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">{labels.noHistory}</div>
            ) : (
              ageHistory.map((value) => (
                <div
                  key={value}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-amber-50 transition"
                >
                  <button
                    type="button"
                    className="flex-1 text-left text-sm text-gray-700"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectAge(value)
                    }}
                  >
                    {value}
                  </button>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-500 transition"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onDeleteProfileValue({ field: 'age', value })
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const ChildDetailsFields = memo(ChildDetailsFieldsComponent)
