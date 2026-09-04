import type { StoryLanguage } from '@/types'

export const DEFAULT_STORY_LANGUAGE: StoryLanguage = 'English'

export function normalizeStoryLanguage(value: unknown): StoryLanguage {
  const raw = String(value ?? '').trim().toLowerCase()
  if (
    raw === 'simplified chinese' ||
    raw === 'chinese simplified' ||
    raw === 'cn_s' ||
    raw === 'zh-cn' ||
    raw === 'simplified'
  ) {
    return 'Simplified Chinese'
  }
  if (
    raw === 'traditional chinese' ||
    raw === 'chinese' ||
    raw === 'cn_t' ||
    raw === 'zh-hk' ||
    raw === 'traditional'
  ) {
    return 'Traditional Chinese'
  }
  if (raw === 'spanish' || raw === 'es') {
    return 'Spanish'
  }
  return DEFAULT_STORY_LANGUAGE
}

export function forceEnglishTextOverrides(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return {
    ...(value as Record<string, unknown>),
    language: DEFAULT_STORY_LANGUAGE,
  }
}
