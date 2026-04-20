'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TemplateRow = {
  template_id?: string | null
  name?: string | null
  story_type?: string | null
  description?: string | null
  cover_image_path?: string | null
}

export type BookRatingSummary = {
  average: number
  count: number
}

export function useBookDisplayData() {
  const [coverMap, setCoverMap] = useState<Record<string, string>>({})
  const [titleMap, setTitleMap] = useState<Record<string, string>>({})
  const [typeMap, setTypeMap] = useState<Record<string, string>>({})
  const [descMap, setDescMap] = useState<Record<string, string>>({})
  const [ratingMap, setRatingMap] = useState<Record<string, BookRatingSummary>>({})

  useEffect(() => {
    let isMounted = true

    const loadCovers = async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)

      if (!isMounted) return
      if (error || !data) return

      const coverLookup: Record<string, string> = {}
      const titleLookup: Record<string, string> = {}
      const typeLookup: Record<string, string> = {}
      const descLookup: Record<string, string> = {}

      ;(data as TemplateRow[]).forEach((row) => {
        if (row?.template_id && row?.name) {
          titleLookup[row.template_id] = String(row.name)
        }

        if (row?.template_id && row?.story_type) {
          typeLookup[row.template_id] = String(row.story_type)
        }

        if (row?.template_id && row?.description) {
          descLookup[row.template_id] = String(row.description)
        }

        if (!row?.template_id) return
        const rawPath = String(row.cover_image_path || '').trim()
        if (!rawPath) return
        if (rawPath.startsWith('http')) {
          coverLookup[row.template_id] = rawPath
          return
        }
        const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '')
        const { data: publicUrl } = supabase.storage
          .from('app-templates')
          .getPublicUrl(cleaned)
        if (publicUrl?.publicUrl) {
          coverLookup[row.template_id] = publicUrl.publicUrl
        }
      })

      setCoverMap(coverLookup)
      setTitleMap(titleLookup)
      setTypeMap(typeLookup)
      setDescMap(descLookup)
    }

    loadCovers()

    fetch('/api/reviews/summary', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { summary: {} }))
      .then((data) => {
        if (!isMounted) return
        const summary = data?.summary ?? {}
        if (summary && typeof summary === 'object') {
          setRatingMap(summary as Record<string, BookRatingSummary>)
        }
      })
      .catch(() => {
        if (!isMounted) return
        setRatingMap({})
      })

    return () => {
      isMounted = false
    }
  }, [])

  return {
    coverMap,
    titleMap,
    typeMap,
    descMap,
    ratingMap,
  }
}
