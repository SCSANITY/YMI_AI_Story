import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { SITE_URL, absoluteUrl } from '@/lib/seo'

export const revalidate = 3600

const PUBLIC_STATIC_PATHS = [
  '/',
  '/books',
  '/community',
  '/collaboration',
  '/support',
]

async function loadTemplatePaths() {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('template_id, created_at')
    .eq('is_active', true)
    .or('is_coming_soon.is.null,is_coming_soon.eq.false')

  if (error || !Array.isArray(data)) return []

  const entries: MetadataRoute.Sitemap = []

  for (const row of data) {
    const templateId = String(row.template_id ?? '').trim()
    if (!templateId) continue
    const lastModified = row.created_at || undefined
    entries.push({
        url: absoluteUrl(`/personalize/${encodeURIComponent(templateId)}`),
        lastModified: lastModified ? new Date(lastModified) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
    })
  }

  return entries
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries = PUBLIC_STATIC_PATHS.map((path) => ({
    url: path === '/' ? SITE_URL : absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === '/' || path === '/books' ? 'weekly' as const : 'monthly' as const,
    priority: path === '/' ? 1 : path === '/books' ? 0.9 : 0.6,
  }))

  return [
    ...staticEntries,
    ...(await loadTemplatePaths()),
  ]
}
