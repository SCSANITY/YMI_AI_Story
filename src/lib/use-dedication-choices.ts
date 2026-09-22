'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DedicationChoice } from '@/lib/dedication'

const EMPTY_CHOICES: Record<string, DedicationChoice> = {}

export function useDedicationChoices(creationIds: string[]) {
  const key = useMemo(() => [...new Set(creationIds.filter(Boolean))].sort().join(','), [creationIds])
  const [state, setState] = useState<{ key: string; choices: Record<string, DedicationChoice>; error: boolean }>({
    key: '', choices: {}, error: false,
  })
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const ids = key.split(',')
    const groups: string[][] = []
    for (let index = 0; index < ids.length; index += 50) groups.push(ids.slice(index, index + 50))
    void Promise.all(groups.map(async group => {
      const params = new URLSearchParams()
      group.forEach(id => params.append('creationId', id))
      const response = await fetch(`/api/dedication?${params}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Dedication status unavailable')
      const data = await response.json()
      const rows: DedicationChoice[] = Array.isArray(data?.choices) ? data.choices : []
      if (rows.length !== group.length) throw new Error('Incomplete dedication status')
      return rows
    })).then(groupsOfRows => {
        const rows = groupsOfRows.flat()
        setState({ key, choices: Object.fromEntries(rows.map(row => [row.creationId, row])), error: false })
      })
      .catch(() => { if (!controller.signal.aborted) setState({ key, choices: {}, error: true }) })
    return () => controller.abort()
  }, [key])
  return { choices: state.key === key ? state.choices : EMPTY_CHOICES, loading: Boolean(key) && state.key !== key,
    error: state.key === key && state.error }
}
