'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnouncementList } from '@/components/admin/sections/announcements/AnnouncementList'
import { AnnouncementWorkspace } from '@/components/admin/sections/announcements/AnnouncementWorkspace'
import {
  isBlogPost,
  type AdminTab,
  type BlogPost,
} from '@/components/admin/sections/announcements/types'

export function AnnouncementsSection() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null)
  const [editorSession, setEditorSession] = useState(0)
  const [mobileTab, setMobileTab] = useState<AdminTab>('edit')
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [listNotice, setListNotice] = useState('')
  const listRequestIntentRef = useRef(0)

  const loadPosts = useCallback(async () => {
    const requestIntent = ++listRequestIntentRef.current
    setLoading(true)
    setLoadError('')

    try {
      const response = await fetch('/api/admin/blog-posts', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load announcements')
      }
      if (listRequestIntentRef.current !== requestIntent) return

      setPosts(Array.isArray(data?.posts) ? data.posts.filter(isBlogPost) : [])
      setHasLoaded(true)
    } catch (error) {
      if (listRequestIntentRef.current !== requestIntent) return
      setLoadError(error instanceof Error ? error.message : 'Failed to load announcements')
      setHasLoaded(true)
    } finally {
      if (listRequestIntentRef.current === requestIntent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadPosts()
    return () => {
      listRequestIntentRef.current += 1
    }
  }, [loadPosts])

  const invalidateInFlightListRequest = useCallback(() => {
    listRequestIntentRef.current += 1
    setLoading(false)
    setLoadError('')
    setHasLoaded(true)
  }, [])

  const startEdit = useCallback((post: BlogPost) => {
    setSelectedPost(post)
    setEditorSession((current) => current + 1)
    setListNotice('')
    setMobileTab('edit')
  }, [])

  const startNew = useCallback(() => {
    setSelectedPost(null)
    setEditorSession((current) => current + 1)
    setListNotice('')
    setMobileTab('edit')
  }, [])

  const handleSaved = useCallback(
    (post: BlogPost, wasCreated: boolean) => {
      invalidateInFlightListRequest()
      setPosts((current) => [
        post,
        ...current.filter((candidate) => candidate.post_id !== post.post_id),
      ])
      setSelectedPost(null)
      setEditorSession((current) => current + 1)
      setListNotice(wasCreated ? 'Announcement created.' : 'Announcement updated.')
      setMobileTab('list')
    },
    [invalidateInFlightListRequest]
  )

  const handleStatusCommitted = useCallback(
    (post: BlogPost) => {
      invalidateInFlightListRequest()
      setPosts((current) => [
        post,
        ...current.filter((candidate) => candidate.post_id !== post.post_id),
      ])
    },
    [invalidateInFlightListRequest]
  )

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2 lg:hidden" role="tablist">
        {(['list', 'edit', 'preview'] as AdminTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`rounded-2xl px-3 py-2 text-sm font-semibold capitalize ${
              mobileTab === tab
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white/[0.06] text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(26rem,1fr)_minmax(22rem,0.9fr)]">
        <div className={mobileTab === 'list' ? 'block' : 'hidden lg:block'}>
          <AnnouncementList
            posts={posts}
            loading={loading}
            hasLoaded={hasLoaded}
            loadError={loadError}
            notice={listNotice}
            onRetry={loadPosts}
            onNew={startNew}
            onEdit={startEdit}
            onStatusCommitted={handleStatusCommitted}
          />
        </div>
        <AnnouncementWorkspace
          key={`${selectedPost?.post_id ?? 'new'}:${editorSession}`}
          selectedPost={selectedPost}
          mobileTab={mobileTab}
          onNew={startNew}
          onSaved={handleSaved}
        />
      </div>
    </>
  )
}
