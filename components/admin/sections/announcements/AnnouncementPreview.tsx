import { Link as LinkIcon } from 'lucide-react'
import {
  normalizeAnnouncementLinks,
  type AnnouncementForm,
} from '@/components/admin/sections/announcements/types'

function imageGridClass(count: number) {
  if (count <= 1) return 'grid-cols-1 max-w-[15rem]'
  if (count === 2 || count === 4) return 'grid-cols-2 max-w-[18rem]'
  return 'grid-cols-3 max-w-[20rem]'
}

export function AnnouncementPreview({ form }: { form: AnnouncementForm }) {
  const images = form.imagePreviewUrls
    .filter((url): url is string => Boolean(url))
    .slice(0, 9)
  const links = normalizeAnnouncementLinks(form.links)

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-600">
            YMI Story
          </p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">
            {form.title.trim() || 'Announcement title'}
          </h3>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Preview
        </span>
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">
        {form.body.trim() ||
          'Write announcement content to preview how it will appear on the public Blog board.'}
      </p>

      {images.length ? (
        <div className={`mt-5 grid gap-2 ${imageGridClass(images.length)}`}>
          {images.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="aspect-square overflow-hidden rounded-xl bg-amber-50"
            >
              {/* Signed private URLs and local blob previews should bypass image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Preview image ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}

      {links.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((link, index) => (
            <span
              key={`${link.url}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              {link.label || link.url}
              <LinkIcon className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-t border-amber-100 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600">
          0 likes
        </span>
        <span className="text-xs text-slate-400">Public users can like this post.</span>
      </div>
    </article>
  )
}
