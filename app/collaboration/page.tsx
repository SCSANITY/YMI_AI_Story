'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import { CollaborationLeadFormSection } from './CollaborationLeadFormSection'
import { CreatorPromoSection } from './CreatorPromoSection'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { useBookCatalog } from '@/components/useBookCatalog'
import { isSupabaseStorageImage } from '@/lib/storage-images'

export default function CollaborationPage() {
  const { user, openLoginModal } = useGlobalContext()
  const { t } = useI18n()
  const { books } = useBookCatalog()

  const posterBooks = useMemo(() => [...books, ...books], [books])

  return (
    <div className="page-surface min-h-screen">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 md:px-8 md:py-14">
        <section className="glass-panel overflow-hidden rounded-[2rem] px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/75 bg-white/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {t('collaboration.badge')}
              </div>
              <h1 className="font-title text-4xl leading-tight text-slate-900 md:text-5xl">
                {t('collaboration.title')}
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-7 text-slate-500 md:text-right">
              {t('collaboration.subtitle')}
            </p>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-[1.75rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.86),rgba(255,255,255,0.7))] p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] md:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                {t('collaboration.posterBadge')}
              </p>
              <h2 className="mt-1 font-title text-xl text-slate-900">
                {t('collaboration.posterTitle')}
              </h2>
            </div>

            <div className="relative space-y-3 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#fff8ef] to-transparent md:w-20" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#fff8ef] to-transparent md:w-20" />

              <div className="collaboration-marquee-track">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-1-${book.bookID}-${index}`}
                    className="glass-panel w-[190px] shrink-0 rounded-[1.4rem] p-2.5 md:w-[230px]"
                  >
                    <div className="relative h-[172px] overflow-hidden rounded-[1rem] border border-white/70 bg-white/70 md:h-[208px]">
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        fill
                        sizes="(max-width: 767px) 190px, 230px"
                        unoptimized={isSupabaseStorageImage(book.coverUrl)}
                        className="object-cover"
                      />
                    </div>
                    <div className="px-1 pb-0.5 pt-2.5">
                      <h3 className="line-clamp-1 font-title text-sm leading-tight text-slate-800">{book.title}</h3>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">{book.storyTypeLabel || book.category}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="collaboration-marquee-track collaboration-marquee-track--reverse">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-2-${book.bookID}-${index}`}
                    className="glass-panel w-[160px] shrink-0 rounded-[1.2rem] p-2 md:w-[200px]"
                  >
                    <div className="relative h-[144px] overflow-hidden rounded-[0.85rem] border border-white/70 bg-white/70 md:h-[180px]">
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        fill
                        sizes="(max-width: 767px) 160px, 200px"
                        unoptimized={isSupabaseStorageImage(book.coverUrl)}
                        className="object-cover"
                      />
                    </div>
                    <div className="px-1 pt-2">
                      <h3 className="line-clamp-1 text-xs font-semibold leading-5 text-slate-700 md:text-sm">{book.title}</h3>
                    </div>
                  </article>
                ))}
              </div>

              <p className="mt-2 text-xs leading-6 text-slate-500 md:hidden">
                {t('collaboration.posterDescription')}
              </p>
            </div>
          </div>
        </section>

        <CreatorPromoSection user={user} openLoginModal={openLoginModal} />
        <CollaborationLeadFormSection user={user} />
      </div>
    </div>
  )
}
