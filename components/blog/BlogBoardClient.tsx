'use client'

import { useEffect, useRef, useState } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { BlogBoardHeader } from './BlogBoardHeader'
import { BlogLightbox } from './BlogLightbox'
import { BlogPostCard } from './BlogPostCard'
import type { BlogPost, LightboxState } from './blogTypes'

export function BlogBoardClient() {
  const { user } = useGlobalContext()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(() => new Set())
  const pendingLikeIdsRef = useRef<Set<string>>(new Set())

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

  const likePost = async (postId: string) => {
    if (pendingLikeIdsRef.current.has(postId)) return

    const previousPost = posts.find((post) => post.post_id === postId)
    if (!previousPost || previousPost.liked_by_me) return

    pendingLikeIdsRef.current = new Set(pendingLikeIdsRef.current).add(postId)
    setPendingLikeIds((prev) => new Set(prev).add(postId))
    setPosts((prev) =>
      prev.map((post) =>
        post.post_id === postId && !post.liked_by_me
          ? { ...post, liked_by_me: true, like_count: post.like_count + 1 }
          : post
      )
    )

    try {
      const response = await fetch(`/api/blog-posts/${postId}/like`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to like announcement')
      const data = await response.json()
      setPosts((prev) =>
        prev.map((post) =>
          post.post_id === postId
            ? { ...post, liked_by_me: Boolean(data?.liked), like_count: Number(data?.like_count ?? post.like_count) }
            : post
        )
      )
    } catch {
      setPosts((prev) =>
        prev.map((post) =>
          post.post_id === postId
            ? {
                ...post,
                liked_by_me: previousPost.liked_by_me,
                like_count: previousPost.like_count,
              }
            : post
        )
      )
    } finally {
      const nextPendingLikeIds = new Set(pendingLikeIdsRef.current)
      nextPendingLikeIds.delete(postId)
      pendingLikeIdsRef.current = nextPendingLikeIds
      setPendingLikeIds((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/70 via-white to-orange-50/50 px-4 py-10">
      <section className="mx-auto max-w-5xl">
        <BlogBoardHeader />

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
              <BlogPostCard
                key={post.post_id}
                post={post}
                isLikePending={pendingLikeIds.has(post.post_id)}
                onOpenLightbox={(images, index) => setLightbox({ images, index })}
                onLike={(postId) => void likePost(postId)}
              />
            ))}
          </div>
        )}
      </section>

      <BlogLightbox
        lightbox={lightbox}
        onClose={() => setLightbox(null)}
        onPrevious={() =>
          setLightbox((prev) =>
            prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : prev
          )
        }
        onNext={() =>
          setLightbox((prev) =>
            prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : prev
          )
        }
      />
    </main>
  )
}
