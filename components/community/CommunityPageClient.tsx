'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  MessageCircle,
  Reply,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { supabase } from '@/lib/supabase'

const MAX_POST_IMAGES = 9

type CommunityPost = {
  post_id: string
  author_name: string
  title?: string | null
  body: string
  image_urls: string[]
  image_alt?: string | null
  like_count: number
  comment_count: number
  liked_by_me?: boolean
  created_at: string
  optimistic_status?: 'uploading' | 'failed'
  optimistic_error?: string | null
}

type CommunityComment = {
  comment_id: string
  parent_comment_id?: string | null
  author_name: string
  body: string
  created_at: string
}

type DraftImage = {
  id: string
  file: File
  previewUrl: string
}

type PostDraftSnapshot = {
  title: string
  body: string
  images: DraftImage[]
}

type ImageViewerState = {
  urls: string[]
  index: number
  alt: string
}

type DraftImageDragState = {
  id: string
  pointerId: number
  offsetX: number
  offsetY: number
  x: number
  y: number
  width: number
  height: number
  previewUrl: string
}

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

const defaultAuthorName = (name?: string | null, email?: string | null) => {
  const trimmedName = String(name ?? '').trim()
  if (trimmedName) return trimmedName
  const [prefix] = String(email ?? '').split('@')
  return prefix || 'YMI friend'
}

function makeDraftImage(file: File): DraftImage {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }
}

async function prepareCommunityImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob || blob.size >= file.size) return file
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'community-image'
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

function ImageGrid({
  urls,
  alt,
  onImageClick,
  compact = false,
}: {
  urls: string[]
  alt: string
  onImageClick?: (index: number) => void
  compact?: boolean
}) {
  const visibleUrls = urls.filter(Boolean).slice(0, MAX_POST_IMAGES)
  if (!visibleUrls.length) return null

  const gridClass =
    visibleUrls.length === 1
      ? compact
        ? 'grid-cols-1 max-w-[172px]'
        : 'grid-cols-1 max-w-[300px]'
      : visibleUrls.length === 2
        ? compact
          ? 'grid-cols-2 max-w-[236px]'
          : 'grid-cols-2 max-w-[380px]'
        : visibleUrls.length === 4
          ? compact
            ? 'grid-cols-2 max-w-[236px]'
            : 'grid-cols-2 max-w-[380px]'
          : compact
            ? 'grid-cols-3 max-w-[312px]'
            : 'grid-cols-3 max-w-[468px]'

  return (
    <div className={`grid gap-1.5 ${gridClass}`}>
      {visibleUrls.map((url, index) => (
        <button
          key={`${url}-${index}`}
          type="button"
          onClick={() => onImageClick?.(index)}
          className="group aspect-square overflow-hidden rounded-xl border border-amber-100 bg-amber-50/70"
        >
          <img
            src={url}
            alt={`${alt} ${index + 1}`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"
          />
        </button>
      ))}
    </div>
  )
}

export function CommunityPageClient() {
  const { user } = useGlobalContext()
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null)
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null)
  const [draftImageDrag, setDraftImageDrag] = useState<DraftImageDragState | null>(null)
  const draftImagesRef = useRef<DraftImage[]>([])
  const draftImageDragRef = useRef<DraftImageDragState | null>(null)

  const authorName = useMemo(() => defaultAuthorName(user?.name, user?.email), [user?.name, user?.email])
  const customerId = user?.customerId ?? null
  const canPublish = Boolean(title.trim() || body.trim() || draftImages.length > 0)
  const draftImageGridClass =
    draftImages.length === 4 ? 'grid max-w-[244px] grid-cols-2 gap-2' : 'grid max-w-[360px] grid-cols-3 gap-2'

  useEffect(() => {
    draftImagesRef.current = draftImages
  }, [draftImages])

  useEffect(() => {
    draftImageDragRef.current = draftImageDrag
  }, [draftImageDrag])

  useEffect(() => {
    return () => {
      draftImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [])

  const loadPosts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (customerId) params.set('customerId', customerId)
      const response = await fetch(`/api/community/posts${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to load community posts')
      const data = await response.json()
      setPosts(Array.isArray(data?.posts) ? data.posts : [])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load community posts')
    } finally {
      setIsLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void loadPosts()
  }, [loadPosts])

  const uploadSinglePostImage = async (file: File) => {
    const uploadFile = await prepareCommunityImage(file)
    const uploadResponse = await fetch('/api/community/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        customerId,
        fileName: uploadFile.name,
        contentType: uploadFile.type || 'application/octet-stream',
      }),
    })
    if (!uploadResponse.ok) throw new Error('Failed to prepare image upload')
    const uploadSpec = await uploadResponse.json()
    const { error: uploadError } = await supabase.storage
      .from(uploadSpec.bucket || 'raw-private')
      .uploadToSignedUrl(uploadSpec.storage_path, uploadSpec.token, uploadFile)
    if (uploadError) throw new Error('Failed to upload image')
    return String(uploadSpec.storage_path)
  }

  const uploadPostImages = async (images: DraftImage[]) => {
    if (!images.length) return []
    return Promise.all(images.map((image) => uploadSinglePostImage(image.file)))
  }

  const handleImageChange = (fileList: FileList | null) => {
    const nextFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'))
    if (!nextFiles.length) return

    if (draftImages.length + nextFiles.length > MAX_POST_IMAGES) {
      setError(`You can upload up to ${MAX_POST_IMAGES} images per post.`)
      return
    }

    setError(null)
    setDraftImages((current) => [...current, ...nextFiles.map(makeDraftImage)])
  }

  const removeImageAt = (index: number) => {
    setDraftImages((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  const moveDraftImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    setDraftImages((current) => {
      if (fromIndex >= current.length || toIndex >= current.length) return current
      const next = [...current]
      const [movedImage] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, movedImage)
      return next
    })
  }

  const handleDraftImagePointerDown = (event: React.PointerEvent<HTMLDivElement>, image: DraftImage) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDraftImageDrag({
      id: image.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      previewUrl: image.previewUrl,
    })
  }

  const handleDraftImagePointerMove = useCallback((event: PointerEvent) => {
    const dragState = draftImageDragRef.current
    if (!dragState || event.pointerId !== dragState.pointerId) return
    event.preventDefault()

    setDraftImageDrag((current) =>
      current
        ? {
            ...current,
            x: event.clientX - current.offsetX,
            y: event.clientY - current.offsetY,
          }
        : current
    )

    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-draft-image-index]'))
      .find((element): element is HTMLElement => Boolean(element && element.dataset.draftImageId !== dragState.id))
    const targetIndex = Number(target?.dataset.draftImageIndex)
    const sourceIndex = draftImagesRef.current.findIndex((image) => image.id === dragState.id)
    if (!Number.isFinite(targetIndex) || sourceIndex < 0 || targetIndex === sourceIndex) return
    moveDraftImage(sourceIndex, targetIndex)
  }, [])

  const handleDraftImagePointerUp = useCallback((event: PointerEvent) => {
    const dragState = draftImageDragRef.current
    if (!dragState || event.pointerId !== dragState.pointerId) return
    setDraftImageDrag(null)
  }, [])

  useEffect(() => {
    if (!draftImageDrag) return
    window.addEventListener('pointermove', handleDraftImagePointerMove, { passive: false })
    window.addEventListener('pointerup', handleDraftImagePointerUp)
    window.addEventListener('pointercancel', handleDraftImagePointerUp)
    return () => {
      window.removeEventListener('pointermove', handleDraftImagePointerMove)
      window.removeEventListener('pointerup', handleDraftImagePointerUp)
      window.removeEventListener('pointercancel', handleDraftImagePointerUp)
    }
  }, [draftImageDrag, handleDraftImagePointerMove, handleDraftImagePointerUp])

  const clearDraftImages = (options: { revoke?: boolean } = {}) => {
    const shouldRevoke = options.revoke ?? true
    setDraftImages((current) => {
      if (shouldRevoke) {
        current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      }
      return []
    })
  }

  const resetPostForm = (options: { revokeImages?: boolean } = {}) => {
    setTitle('')
    setBody('')
    clearDraftImages({ revoke: options.revokeImages ?? true })
  }

  const createOptimisticPost = (draft: PostDraftSnapshot): CommunityPost => ({
    post_id: `local-${crypto.randomUUID()}`,
    author_name: authorName,
    title: draft.title.trim() || null,
    body: draft.body.trim(),
    image_urls: draft.images.map((image) => image.previewUrl),
    image_alt: draft.title.trim() || 'Community image',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    created_at: new Date().toISOString(),
    optimistic_status: 'uploading',
    optimistic_error: null,
  })

  const revokeDraftImageUrls = (images: DraftImage[]) => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl))
  }

  const handleCreatePost = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canPublish) {
      setError('Write something or add at least one image before publishing.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    const draftSnapshot: PostDraftSnapshot = {
      title,
      body,
      images: [...draftImages],
    }
    const optimisticPost = createOptimisticPost(draftSnapshot)

    setPosts((prev) => [optimisticPost, ...prev])
    resetPostForm({ revokeImages: false })
    setIsSubmitting(false)

    void (async () => {
      try {
        const imageStoragePaths = await uploadPostImages(draftSnapshot.images)
        const response = await fetch('/api/community/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            customerId,
            authorName,
            title: draftSnapshot.title,
            body: draftSnapshot.body,
            imageStoragePaths,
          }),
        })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error || 'Failed to publish post')
        }
        const data = await response.json()
        setPosts((prev) => prev.map((post) => (post.post_id === optimisticPost.post_id ? data.post : post)))
        setSelectedPost((prev) => (prev?.post_id === optimisticPost.post_id ? data.post : prev))
        revokeDraftImageUrls(draftSnapshot.images)
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : 'Failed to publish post'
        setPosts((prev) =>
          prev.map((post) =>
            post.post_id === optimisticPost.post_id
              ? { ...post, optimistic_status: 'failed', optimistic_error: message }
              : post
          )
        )
        setSelectedPost((prev) =>
          prev?.post_id === optimisticPost.post_id
            ? { ...prev, optimistic_status: 'failed', optimistic_error: message }
            : prev
        )
        setError(message)
      }
    })()
  }

  const openPost = async (post: CommunityPost) => {
    setSelectedPost(post)
    if (post.post_id.startsWith('local-')) {
      setIsDetailLoading(false)
      setComments([])
      setReplyTo(null)
      setCommentText('')
      return
    }
    setIsDetailLoading(true)
    setComments([])
    setReplyTo(null)
    setCommentText('')
    try {
      const params = new URLSearchParams()
      if (customerId) params.set('customerId', customerId)
      const response = await fetch(`/api/community/posts/${post.post_id}${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to open post')
      const data = await response.json()
      setSelectedPost(data.post)
      setComments(Array.isArray(data?.comments) ? data.comments : [])
      setPosts((prev) => prev.map((item) => (item.post_id === post.post_id ? data.post : item)))
    } finally {
      setIsDetailLoading(false)
    }
  }

  const openImageViewer = (post: CommunityPost, index: number) => {
    if (!post.image_urls?.length) return
    setImageViewer({
      urls: post.image_urls.slice(0, MAX_POST_IMAGES),
      index,
      alt: post.title || 'Community image',
    })
  }

  const moveImageViewer = (direction: -1 | 1) => {
    setImageViewer((current) => {
      if (!current) return current
      const nextIndex = (current.index + direction + current.urls.length) % current.urls.length
      return { ...current, index: nextIndex }
    })
  }

  const toggleLike = async (post: CommunityPost) => {
    if (post.post_id.startsWith('local-')) return
    const response = await fetch(`/api/community/posts/${post.post_id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ customerId }),
    })
    if (!response.ok) return
    const data = await response.json()
    const update = (item: CommunityPost): CommunityPost =>
      item.post_id === post.post_id
        ? { ...item, liked_by_me: Boolean(data.liked), like_count: Number(data.like_count ?? item.like_count) }
        : item
    setPosts((prev) => prev.map(update))
    setSelectedPost((prev) => (prev ? update(prev) : prev))
  }

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedPost || !commentText.trim()) return
    if (selectedPost.post_id.startsWith('local-')) return
    const response = await fetch(`/api/community/posts/${selectedPost.post_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        customerId,
        authorName,
        body: commentText,
        parentCommentId: replyTo?.comment_id ?? null,
      }),
    })
    if (!response.ok) return
    const data = await response.json()
    setComments((prev) => [...prev, data.comment])
    const nextCount = Number(data.comment_count ?? selectedPost.comment_count + 1)
    setSelectedPost((prev) => (prev ? { ...prev, comment_count: nextCount } : prev))
    setPosts((prev) =>
      prev.map((post) => (post.post_id === selectedPost.post_id ? { ...post, comment_count: nextCount } : post))
    )
    setCommentText('')
    setReplyTo(null)
  }

  const topLevelComments = comments.filter((comment) => !comment.parent_comment_id)
  const repliesByParent = comments.reduce<Record<string, CommunityComment[]>>((acc, comment) => {
    if (!comment.parent_comment_id) return acc
    acc[comment.parent_comment_id] = [...(acc[comment.parent_comment_id] ?? []), comment]
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-[#fffaf4]">
      <section className="border-b border-amber-100/70 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.24),transparent_32%),linear-gradient(180deg,#fff8ec,#fffaf4)]">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              Community Stories
            </div>
            <h1 className="font-title text-4xl font-bold tracking-tight text-gray-950 md:text-6xl">
              Share the moments behind every YMI story.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
              A light community board for families to share photos, thoughts, questions, and storybook moments.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="w-full max-w-3xl space-y-5">
          <form
            onSubmit={handleCreatePost}
            className="overflow-hidden rounded-[28px] border border-white/70 bg-white/72 p-5 shadow-[0_24px_60px_rgba(146,64,14,0.10)] backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-950">Create a post</h2>
                <p className="text-sm text-gray-500">Post as {authorName}</p>
              </div>
            </div>

            <div className="grid gap-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Title (optional)"
                className="h-12 rounded-2xl border border-amber-100 bg-white/80 px-4 text-sm font-semibold outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                placeholder="Share a story moment, a question, or a note for other families..."
                className="min-h-28 resize-none rounded-2xl border border-amber-100 bg-white/80 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
              />
            </div>

            {draftImages.length ? (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-2">
                <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs font-semibold text-amber-700">
                  <span>{draftImages.length}/{MAX_POST_IMAGES} images</span>
                  <button type="button" onClick={() => clearDraftImages()} className="hover:text-amber-900">
                    Clear all
                  </button>
                </div>
                <div className={draftImageGridClass}>
                  {draftImages.map((image, index) => (
                    <motion.div
                      key={image.id}
                      layout
                      data-draft-image-index={index}
                      data-draft-image-id={image.id}
                      onPointerDown={(event) => handleDraftImagePointerDown(event, image)}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className={`relative aspect-square touch-none overflow-hidden rounded-xl bg-white ${
                        draftImageDrag?.id === image.id
                          ? 'cursor-grabbing opacity-25 ring-2 ring-amber-400'
                          : 'cursor-grab transition hover:ring-2 hover:ring-amber-200'
                      }`}
                    >
                      <img
                        src={image.previewUrl}
                        alt={`Post preview ${index + 1}`}
                        draggable={false}
                        className="h-full w-full select-none object-cover"
                      />
                      <div className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">
                        {index + 1}
                      </div>
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeImageAt(index)
                        }}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-50">
                <ImagePlus className="h-4 w-4" />
                Add images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleImageChange(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || !canPublish}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 text-sm font-bold text-white shadow-lg shadow-amber-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? 'Publishing...' : 'Publish'}
              </button>
            </div>
            {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
          </form>

          {isLoading ? (
            <div className="rounded-[28px] border border-white/70 bg-white/70 p-8 text-center text-sm text-gray-500">
              Loading posts...
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-[28px] border border-white/70 bg-white/70 p-8 text-center">
              <h3 className="text-lg font-bold text-gray-900">No posts yet</h3>
              <p className="mt-2 text-sm text-gray-500">Be the first family to share a story moment.</p>
            </div>
          ) : (
            posts.map((post) => (
              <article
                key={post.post_id}
                className="rounded-[22px] border border-white/70 bg-white/80 p-4 shadow-[0_14px_36px_rgba(146,64,14,0.08)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(146,64,14,0.11)]"
              >
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span className="font-semibold text-amber-700">{post.author_name}</span>
                      <div className="flex items-center gap-2">
                        {post.optimistic_status === 'uploading' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                            Publishing...
                          </span>
                        ) : null}
                        {post.optimistic_status === 'failed' ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-600">
                            Publish failed
                          </span>
                        ) : null}
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => void openPost(post)} className="block text-left">
                      {post.title ? (
                        <h3 className="text-xl font-bold leading-snug text-gray-950 transition hover:text-amber-700">
                          {post.title}
                        </h3>
                      ) : null}
                      {post.body ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{post.body}</p> : null}
                    </button>
                  </div>
                  <ImageGrid
                    urls={post.image_urls}
                    alt={post.image_alt || post.title || 'Community image'}
                    onImageClick={(index) => openImageViewer(post, index)}
                    compact
                  />
                  <div className="flex items-center gap-2 border-t border-amber-100/70 pt-3">
                    <button
                      type="button"
                      onClick={() => void toggleLike(post)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition ${
                        post.liked_by_me
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-gray-600 hover:bg-amber-100 hover:text-amber-700'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${post.liked_by_me ? 'fill-current' : ''}`} />
                      {post.like_count}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPost(post)}
                      className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-bold text-gray-600 transition hover:bg-amber-100 hover:text-amber-700"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {post.comment_count}
                    </button>
                  </div>
                  {post.optimistic_status === 'failed' && post.optimistic_error ? (
                    <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
                      {post.optimistic_error}
                    </p>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_18px_48px_rgba(146,64,14,0.08)] backdrop-blur-xl">
            <h2 className="text-lg font-bold text-gray-950">Community guide</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
              <li>Share family-friendly photos and storybook moments.</li>
              <li>Keep comments kind, helpful, and relevant.</li>
              <li>Avoid private order details or personal contact information.</li>
            </ul>
          </div>
        </aside>
      </section>

      {selectedPost ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
          <button
            aria-label="Close post"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setSelectedPost(null)}
          />
          <section className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-amber-100 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{selectedPost.author_name}</p>
                {selectedPost.title ? <h2 className="mt-1 text-2xl font-bold text-gray-950">{selectedPost.title}</h2> : null}
                {selectedPost.optimistic_status ? (
                  <p
                    className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      selectedPost.optimistic_status === 'failed'
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {selectedPost.optimistic_status === 'failed'
                      ? selectedPost.optimistic_error || 'Publish failed'
                      : 'Publishing in the background...'}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">
              {isDetailLoading ? <p className="text-sm text-gray-500">Loading discussion...</p> : null}
              {selectedPost.body ? (
                <p className="mb-5 whitespace-pre-line text-sm leading-7 text-gray-700">{selectedPost.body}</p>
              ) : null}
              <div className="mb-5">
                <ImageGrid
                  urls={selectedPost.image_urls}
                  alt={selectedPost.image_alt || selectedPost.title || 'Community image'}
                  onImageClick={(index) => openImageViewer(selectedPost, index)}
                />
              </div>
              <div className="mt-5 flex items-center gap-3 border-y border-amber-100 py-4">
                <button
                  type="button"
                  onClick={() => void toggleLike(selectedPost)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                    selectedPost.liked_by_me ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-gray-600'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${selectedPost.liked_by_me ? 'fill-current' : ''}`} />
                  {selectedPost.like_count}
                </button>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-500">
                  <MessageCircle className="h-4 w-4" />
                  {selectedPost.comment_count}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <h3 className="text-lg font-bold text-gray-950">Discussion</h3>
                {topLevelComments.map((comment) => (
                  <div key={comment.comment_id} className="rounded-2xl bg-amber-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-gray-900">{comment.author_name}</span>
                      <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">{comment.body}</p>
                    <button
                      type="button"
                      onClick={() => setReplyTo(comment)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Reply
                    </button>
                    {(repliesByParent[comment.comment_id] ?? []).map((reply) => (
                      <div key={reply.comment_id} className="ml-4 mt-3 rounded-xl bg-white/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-gray-900">{reply.author_name}</span>
                          <span className="text-[11px] text-gray-400">{formatDate(reply.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-600">{reply.body}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <form onSubmit={addComment} className="mt-5 rounded-2xl border border-amber-100 bg-white/70 p-4">
                {replyTo ? (
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Replying to {replyTo.author_name}
                    <button type="button" onClick={() => setReplyTo(null)} className="font-bold">
                      Cancel
                    </button>
                  </div>
                ) : null}
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Write a comment..."
                  className="min-h-24 w-full resize-none rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={!commentText.trim() || selectedPost.post_id.startsWith('local-')}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Comment
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {imageViewer ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/82 p-4">
          <button className="absolute inset-0" aria-label="Close image viewer" onClick={() => setImageViewer(null)} />
          <button
            type="button"
            onClick={() => setImageViewer(null)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          {imageViewer.urls.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => moveImageViewer(-1)}
                className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => moveImageViewer(1)}
                className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <div className="relative z-10 flex max-h-[88vh] max-w-[92vw] flex-col items-center gap-3">
            <img
              src={imageViewer.urls[imageViewer.index]}
              alt={`${imageViewer.alt} ${imageViewer.index + 1}`}
              className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            />
            <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              {imageViewer.index + 1} / {imageViewer.urls.length}
            </div>
          </div>
        </div>
      ) : null}

      {draftImageDrag ? (
        <div
          className="pointer-events-none fixed z-[140] overflow-hidden rounded-xl border border-amber-200 bg-white shadow-[0_18px_40px_rgba(146,64,14,0.24)] ring-2 ring-amber-400"
          style={{
            left: draftImageDrag.x,
            top: draftImageDrag.y,
            width: draftImageDrag.width,
            height: draftImageDrag.height,
            transform: 'scale(1.06)',
          }}
        >
          <img
            src={draftImageDrag.previewUrl}
            alt="Dragging preview"
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        </div>
      ) : null}
    </main>
  )
}
