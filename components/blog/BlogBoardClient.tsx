'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, Heart, Megaphone, X } from 'lucide-react'
import { useGlobalContext } from '@/contexts/GlobalContext'

type BlogPost = {
  post_id: string
  title: string
  body: string
  image_urls: string[]
  links: Array<{ label: string; url: string }>
  like_count: number
  liked_by_me: boolean
  published_at: string | null
  created_at: string
}

type LightboxState = {
  images: string[]
  index: number
} | null

function formatDate(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function imageGridClass(count: number) {
  if (count <= 1) return 'grid-cols-1 max-w-sm'
  if (count === 2) return 'grid-cols-2 max-w-md'
  if (count === 4) return 'grid-cols-2 max-w-md'
  return 'grid-cols-3 max-w-lg'
}

export function BlogBoardClient() {
  const { user } = useGlobalContext()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  useEffect(() => {
    let active = true
    fetch('/api/blog-posts', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load announcements'))))
      .then((data) => {
        if (!active) return
        setPosts(Array.isArray(data?.posts) ? data.posts : [])
        setError('')
      })
      .catch((nextError) => {
        if (!active) return
        setError(nextError instanceof Error ? nextError.message : 'Failed to load announcements')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user?.customerId])

  const currentLightboxImage = useMemo(() => {
    if (!lightbox) return null
    return lightbox.images[lightbox.index] ?? null
  }, [lightbox])

  const likePost = async (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.post_id === postId && !post.liked_by_me
          ? { ...post, liked_by_me: true, like_count: post.like_count + 1 }
          : post
      )
    )

    const response = await fetch(`/api/blog-posts/${postId}/like`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) return
    const data = await response.json()
    setPosts((prev) =>
      prev.map((post) =>
        post.post_id === postId
          ? { ...post, liked_by_me: Boolean(data?.liked), like_count: Number(data?.like_count ?? post.like_count) }
          : post
      )
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/70 via-white to-orange-50/50 px-4 py-10">
      <section className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-[28px] border border-white/80 bg-white/72 p-6 shadow-[0_18px_60px_rgba(120,74,20,0.10)] backdrop-blur-2xl md:p-8">
          <div className="flex items-center gap-3 text-amber-600">
            <Megaphone className="h-6 w-6" />
            <span className="text-xs font-bold uppercase tracking-[0.28em]">YMI Story Board</span>
          </div>
          <h1 className="mt-4 font-title text-4xl text-gray-900 md:text-5xl">Announcements</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-base">
            Product news, family storytelling notes, and important updates from the YMI Story team.
          </p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center text-gray-500 shadow-sm backdrop-blur-xl">
            Loading announcements...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-center text-red-600">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center text-gray-500 shadow-sm backdrop-blur-xl">
            No announcements yet.
          </div>
        ) : (
          <div className="space-y-5">
            {posts.map((post) => (
              <article
                key={post.post_id}
                className="rounded-[26px] border border-white/80 bg-white/78 p-5 shadow-[0_14px_44px_rgba(120,74,20,0.10)] backdrop-blur-2xl md:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">YMI Story</p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">{post.title}</h2>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">{formatDate(post.published_at || post.created_at)}</time>
                </div>

                {post.body ? (
                  <p className="mt-4 whitespace-pre-line text-sm leading-7 text-gray-600 md:text-base">{post.body}</p>
                ) : null}

                {post.image_urls?.length ? (
                  <div className={`mt-5 grid gap-2 ${imageGridClass(post.image_urls.length)}`}>
                    {post.image_urls.slice(0, 9).map((url, index) => (
                      <button
                        key={`${post.post_id}-${url}-${index}`}
                        type="button"
                        onClick={() => setLightbox({ images: post.image_urls, index })}
                        className="relative aspect-square overflow-hidden rounded-xl bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <Image
                          src={url}
                          alt={`${post.title} image ${index + 1}`}
                          fill
                          sizes="(max-width: 767px) 30vw, 180px"
                          loading="lazy"
                          className="object-cover transition-transform duration-300 hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}

                {post.links?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {post.links.map((link, index) => (
                      <a
                        key={`${post.post_id}-link-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                      >
                        {link.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex items-center justify-between border-t border-amber-100/70 pt-4">
                  <button
                    type="button"
                    onClick={() => likePost(post.post_id)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      post.liked_by_me
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-white/70 text-gray-500 hover:bg-rose-50 hover:text-rose-600'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${post.liked_by_me ? 'fill-current' : ''}`} />
                    {post.like_count}
                  </button>
                  <span className="text-xs text-gray-400">Announcements are managed by YMI Story.</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {lightbox && currentLightboxImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4">
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/12 p-2 text-white backdrop-blur transition hover:bg-white/20"
            aria-label="Close image preview"
          >
            <X className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() =>
              setLightbox((prev) =>
                prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : prev
              )
            }
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-4 py-3 text-2xl text-white backdrop-blur transition hover:bg-white/20"
            aria-label="Previous image"
          >
            ‹
          </button>
          {/* Lightbox uses the original image so admins/users can inspect the full uploaded asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentLightboxImage} alt="Announcement preview" className="max-h-[86vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl" />
          <button
            type="button"
            onClick={() =>
              setLightbox((prev) =>
                prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : prev
              )
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-4 py-3 text-2xl text-white backdrop-blur transition hover:bg-white/20"
            aria-label="Next image"
          >
            ›
          </button>
        </div>
      ) : null}
    </main>
  )
}
