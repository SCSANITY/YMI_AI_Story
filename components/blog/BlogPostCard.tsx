import Image from 'next/image'
import { ExternalLink, Heart, Loader2 } from 'lucide-react'
import type { BlogPost } from './blogTypes'
import { isSupabaseStorageImage } from '@/lib/storage-images'

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

type BlogPostCardProps = {
  post: BlogPost
  isLikePending: boolean
  onOpenLightbox: (images: string[], index: number) => void
  onLike: (postId: string) => void
}

export function BlogPostCard({ post, isLikePending, onOpenLightbox, onLike }: BlogPostCardProps) {
  return (
    <article className="rounded-[26px] border border-white/80 bg-white/78 p-5 shadow-[0_14px_44px_rgba(120,74,20,0.10)] backdrop-blur-2xl md:p-6">
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
              onClick={() => onOpenLightbox(post.image_urls, index)}
              className="relative aspect-square overflow-hidden rounded-xl bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <Image
                src={url}
                alt={`${post.title} image ${index + 1}`}
                fill
                sizes="(max-width: 767px) 30vw, 180px"
                loading="lazy"
                unoptimized={isSupabaseStorageImage(url)}
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
          disabled={post.liked_by_me || isLikePending}
          onClick={() => onLike(post.post_id)}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
            post.liked_by_me
              ? 'bg-rose-50 text-rose-600'
              : 'bg-white/70 text-gray-500 hover:bg-rose-50 hover:text-rose-600'
          }`}
        >
          {isLikePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className={`h-4 w-4 ${post.liked_by_me ? 'fill-current' : ''}`} />
          )}
          {post.like_count}
        </button>
        <span className="text-xs text-gray-400">Announcements are managed by YMI Story.</span>
      </div>
    </article>
  )
}
