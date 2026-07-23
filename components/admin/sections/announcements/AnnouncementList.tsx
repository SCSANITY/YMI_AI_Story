import { AnnouncementListItem } from '@/components/admin/sections/announcements/AnnouncementListItem'
import type { BlogPost } from '@/components/admin/sections/announcements/types'

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
    <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
            All announcements
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">Manage content</h2>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="rounded-full bg-amber-400/12 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/18"
        >
          New
        </button>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="mb-3 flex flex-col gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="w-fit font-bold underline decoration-rose-300/50 underline-offset-4"
          >
            Retry
          </button>
        </div>
      ) : notice ? (
        <p
          role="status"
          className="mb-3 rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      {!hasLoaded && loading ? (
        <div className="space-y-3" role="status" aria-label="Loading announcements">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">
          {loadError ? 'No cached announcement data is available.' : 'No announcements yet.'}
        </p>
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
    </section>
  )
}
