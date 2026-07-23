'use client'

import { useEffect, useRef, useState } from 'react'
import { Archive, Eye, EyeOff, Pencil } from 'lucide-react'
import {
  isBlogPost,
  type BlogPost,
  type BlogPostStatus,
} from '@/components/admin/sections/announcements/types'

function statusBadge(status: BlogPostStatus) {
  const classes = {
    published: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20',
    draft: 'bg-slate-500/12 text-slate-300 border-slate-400/20',
    hidden: 'bg-amber-500/12 text-amber-300 border-amber-400/20',
    archived: 'bg-zinc-500/14 text-zinc-300 border-zinc-400/20',
  }
  return classes[status]
}

export function AnnouncementListItem({
  post,
  onEdit,
  onStatusCommitted,
}: {
  post: BlogPost
  onEdit: (post: BlogPost) => void
  onStatusCommitted: (post: BlogPost) => void
}) {
  const [displayPost, setDisplayPost] = useState(post)
  const [pendingStatus, setPendingStatus] = useState<BlogPostStatus | null>(null)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const requestIntentRef = useRef(0)

  useEffect(() => {
    if (!pendingStatus) setDisplayPost(post)
  }, [pendingStatus, post])

  useEffect(
    () => () => {
      requestIntentRef.current += 1
    },
    []
  )

  const changeStatus = async (status: BlogPostStatus) => {
    if (pendingStatus || status === displayPost.status) return
    const requestIntent = ++requestIntentRef.current
    setPendingStatus(status)
    setNotice(null)

    try {
      const response = await fetch(`/api/admin/blog-posts/${displayPost.post_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update announcement status')
      }
      if (!isBlogPost(data?.post)) {
        throw new Error('The status changed, but the server response was incomplete')
      }
      if (requestIntentRef.current !== requestIntent) return

      setDisplayPost(data.post)
      onStatusCommitted(data.post)
      setNotice({ tone: 'success', text: `Status changed to ${data.post.status}.` })
    } catch (error) {
      if (requestIntentRef.current !== requestIntent) return
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to update announcement status',
      })
    } finally {
      if (requestIntentRef.current === requestIntent) {
        setPendingStatus(null)
      }
    }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(displayPost.status)}`}
          >
            {displayPost.status}
          </span>
          <h3 className="mt-2 break-words text-lg font-bold text-white">
            {displayPost.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">
            {displayPost.body || 'No body text'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEdit(displayPost)}
          disabled={Boolean(pendingStatus)}
          className="rounded-full bg-white/10 p-2 text-slate-300 hover:bg-amber-400/16 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50"
          aria-label="Edit announcement"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{displayPost.image_storage_paths.length} images</span>
        <span>{displayPost.links.length} links</span>
        <span>{displayPost.like_count ?? 0} likes</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusButton
          label="Publish"
          status="published"
          activeStatus={displayPost.status}
          pendingStatus={pendingStatus}
          icon={<Eye className="h-3.5 w-3.5" />}
          className="bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18"
          onClick={changeStatus}
        />
        <StatusButton
          label="Hide"
          status="hidden"
          activeStatus={displayPost.status}
          pendingStatus={pendingStatus}
          icon={<EyeOff className="h-3.5 w-3.5" />}
          className="bg-amber-500/12 text-amber-300 hover:bg-amber-500/18"
          onClick={changeStatus}
        />
        <StatusButton
          label="Archive"
          status="archived"
          activeStatus={displayPost.status}
          pendingStatus={pendingStatus}
          icon={<Archive className="h-3.5 w-3.5" />}
          className="bg-slate-500/14 text-slate-300 hover:bg-slate-500/20"
          onClick={changeStatus}
        />
      </div>

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-xs ${notice.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
        >
          {notice.text}
        </p>
      ) : null}
    </article>
  )
}

function StatusButton({
  label,
  status,
  activeStatus,
  pendingStatus,
  icon,
  className,
  onClick,
}: {
  label: string
  status: BlogPostStatus
  activeStatus: BlogPostStatus
  pendingStatus: BlogPostStatus | null
  icon: React.ReactNode
  className: string
  onClick: (status: BlogPostStatus) => Promise<void>
}) {
  const isPending = pendingStatus === status
  return (
    <button
      type="button"
      onClick={() => void onClick(status)}
      disabled={Boolean(pendingStatus) || activeStatus === status}
      aria-pressed={activeStatus === status}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      {isPending ? 'Saving...' : label}
    </button>
  )
}
