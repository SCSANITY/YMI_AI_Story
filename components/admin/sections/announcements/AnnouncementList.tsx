import { AnnouncementListItem } from '@/components/admin/sections/announcements/AnnouncementListItem'
import type { BlogPost } from '@/components/admin/sections/announcements/types'
import {
  AdminButton,
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
} from '@/components/admin/AdminUi'

export function AnnouncementList({
  posts,
  loading,
  hasLoaded,
  loadError,
  notice,
  onRetry,
  onNew,
  onEdit,
  onStatusCommitted,
}: {
  posts: BlogPost[]
  loading: boolean
  hasLoaded: boolean
  loadError: string
  notice: string
  onRetry: () => Promise<void>
  onNew: () => void
  onEdit: (post: BlogPost) => void
  onStatusCommitted: (post: BlogPost) => void
}) {
  return (
    <AdminPanel className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">
            All announcements
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">Manage content</h2>
        </div>
        <AdminButton
          type="button"
          onClick={onNew}
          tone="primary"
          className="min-h-9 px-3 text-xs"
        >
          New
        </AdminButton>
      </div>

      {loadError ? (
        <AdminNotice tone="danger" role="alert" className="mb-3 flex flex-col gap-2 text-sm">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="w-fit font-bold underline decoration-rose-300/50 underline-offset-4"
          >
            Retry
          </button>
        </AdminNotice>
      ) : notice ? (
        <AdminNotice tone="success" role="status" className="mb-3 text-sm">
          {notice}
        </AdminNotice>
      ) : null}

      {!hasLoaded && loading ? (
        <div className="space-y-3" role="status" aria-label="Loading announcements">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <AdminEmptyState className="p-4 text-sm">
          {loadError ? 'No cached announcement data is available.' : 'No announcements yet.'}
        </AdminEmptyState>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <AnnouncementListItem
              key={post.post_id}
              post={post}
              onEdit={onEdit}
              onStatusCommitted={onStatusCommitted}
            />
          ))}
        </div>
      )}
    </AdminPanel>
  )
}
