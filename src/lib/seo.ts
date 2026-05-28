import type { Metadata } from 'next'

export const SITE_URL = 'https://www.ymistory.com'
export const SITE_NAME = 'YMI Story'
export const DEFAULT_SITE_TITLE = 'YMI Story | Personalized Children\'s Storybooks'
export const DEFAULT_SITE_DESCRIPTION =
  'Create personalized children\'s storybooks where your child becomes the hero through AI-powered illustrations, magical previews, and beautiful digital delivery.'
export const DEFAULT_OG_IMAGE = '/og/ymi-story-og.png'

export function absoluteUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalizedPath}`
}

export function canonicalUrl(path: string) {
  return absoluteUrl(path)
}

export function publicPageMetadata({
  title,
  absoluteTitle,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
}: {
  title: string
  absoluteTitle?: string
  description: string
  path: string
  image?: string
}): Metadata {
  const canonical = canonicalUrl(path)
  const imageUrl = absoluteUrl(image)
  const fullTitle = absoluteTitle ?? (title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`)

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: canonical,
      images: [
        {
          url: imageUrl,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [imageUrl],
    },
  }
}

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}
