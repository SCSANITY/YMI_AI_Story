'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Book } from '@/types'
import { BookCard } from '@/components/BookCard'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { useBookDisplayData } from '@/components/useBookDisplayData'
import { useBookCatalog } from '@/components/useBookCatalog'
import { canEnterCustomize } from '@/lib/customize-access-client'

type HomeBookCategory = {
  titleKey: string
  descriptionKey: string
  sectionId: string
  fallbackBookIds: string[]
  afterBanner?: {
    src: string
    mobileSrc?: string
    alt: string
    width: number
    height: number
    aspectClassName: string
  }
}

const HOME_BOOK_CATEGORIES: HomeBookCategory[] = [
  {
    titleKey: 'homeBooks.category.brandNew',
    descriptionKey: 'homeBooks.category.brandNewDescription',
    sectionId: 'brand_new',
    fallbackBookIds: ['Planet_story', 'Seed_story', 'Music_story', 'Adventure_story'],
    afterBanner: {
      src: '/banners/optimized/workflow-desktop.webp',
      mobileSrc: '/banners/optimized/workflow-mobile.webp',
      alt: 'YMI Story workflow banner',
      width: 6000,
      height: 3000,
      aspectClassName: 'aspect-[2/1]',
    },
  },
  {
    titleKey: 'homeBooks.category.forBoys',
    descriptionKey: 'homeBooks.category.forBoysDescription',
    sectionId: 'for_boys',
    fallbackBookIds: ['Planet_story', 'Noah_story', 'Space_story', 'Scientist_story'],
    afterBanner: {
      src: '/banners/optimized/swapface-desktop.webp',
      mobileSrc: '/banners/optimized/swapface-mobile.webp',
      alt: 'YMI Story face swap banner',
      width: 6000,
      height: 2700,
      aspectClassName: 'aspect-[6000/2700]',
    },
  },
  {
    titleKey: 'homeBooks.category.forGirls',
    descriptionKey: 'homeBooks.category.forGirlsDescription',
    sectionId: 'for_girls',
    fallbackBookIds: ['Adventure_story', 'Sister_story', 'Birthday_story', 'Seed_story'],
  },
  {
    titleKey: 'homeBooks.category.inDiscount',
    descriptionKey: 'homeBooks.category.inDiscountDescription',
    sectionId: 'in_discount',
    fallbackBookIds: ['Music_story', 'Explorer_story', 'Planet_story', 'Seed_story'],
  },
]

function getCategoryBooks(allBooks: Book[], category: HomeBookCategory): Book[] {
  const explicitBooks = allBooks.filter((book) => book.homeSections?.includes(category.sectionId))
  const fallbackById = new Map(allBooks.map((book) => [book.bookID, book]))
  const fallbackBooks = category.fallbackBookIds
    .map((bookId) => fallbackById.get(bookId))
    .filter((book): book is Book => Boolean(book))
  const combined = [...explicitBooks, ...fallbackBooks, ...allBooks]
  const seen = new Set<string>()
  return combined.filter((book) => {
    if (seen.has(book.bookID)) return false
    seen.add(book.bookID)
    return true
  }).slice(0, 4)
}

function CategoryBanner({ banner }: { banner: NonNullable<HomeBookCategory['afterBanner']> }) {
  return (
    <div className="relative left-1/2 mt-10 mb-0 w-screen -translate-x-1/2 overflow-hidden md:mt-14">
      <div className={`relative w-full overflow-hidden shadow-[0_18px_50px_rgba(251,146,60,0.12)] ${banner.aspectClassName}`}>
        <picture className="block h-full w-full">
          {banner.mobileSrc ? <source media="(max-width: 767px)" srcSet={banner.mobileSrc} /> : null}
          <img
            src={banner.src}
            alt={banner.alt}
            width={banner.width}
            height={banner.height}
            loading="lazy"
            decoding="async"
            className="block h-full w-full object-cover"
          />
        </picture>
        <Link
          href="/books"
          aria-label="Explore all YMI Story books"
          className="absolute inset-0 block cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        />
      </div>
    </div>
  )
}

export function HomeBookCategories() {
  const router = useRouter()
  const { t } = useI18n()
  const { favorites, toggleFavorite } = useGlobalContext()
  const { books: catalogBooks } = useBookCatalog()
  const { ratingMap } = useBookDisplayData()

  const handlePersonalize = async (bookID: string) => {
    const allowed = await canEnterCustomize()
    if (!allowed) return
    router.push(`/personalize/${bookID}`)
  }

  return (
    <section className="page-surface page-surface--flush-bottom relative pt-12 pb-10 md:pt-20 md:pb-14">
      <div className="container mx-auto min-w-0 px-4 md:px-6 lg:px-12">
        <div className="mx-auto mb-10 max-w-4xl text-center md:mb-14">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">
            {t('homeBooks.eyebrow')}
          </p>
          <h2 className="font-title text-3xl leading-tight text-gray-900 md:text-5xl">
            {t('homeBooks.heading')}
          </h2>
          <p className="mx-auto mt-4 text-sm leading-relaxed text-gray-500 md:text-base">
            {t('homeBooks.subheading')}
          </p>
        </div>

        <div className="space-y-14 md:space-y-20">
          {HOME_BOOK_CATEGORIES.map((category) => {
            const books = getCategoryBooks(catalogBooks, category)

            return (
              <div key={category.titleKey}>
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-9">
                  <div>
                    <h3 className="font-title text-2xl text-gray-900 md:text-3xl">
                      {t(category.titleKey)}
                    </h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
                      {t(category.descriptionKey)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/books')}
                    className="inline-flex w-fit shrink-0 items-center justify-center self-start rounded-full border border-orange-200/70 bg-orange-200/32 px-5 py-2.5 text-xs font-semibold tracking-normal text-orange-800 shadow-[0_8px_24px_rgba(234,88,12,0.12),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition-all duration-200 hover:border-orange-200/90 hover:bg-orange-200/45 hover:text-orange-900 hover:shadow-[0_12px_30px_rgba(251,146,60,0.20),inset_0_1px_0_rgba(255,255,255,0.88)] sm:-translate-y-1 sm:translate-x-2 sm:self-auto sm:px-6 sm:text-sm"
                  >
                    <span>{t('homeBooks.viewAll')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-8">
                  {books.map((book) => (
                    <BookCard
                      key={`${category.titleKey}-${book.bookID}`}
                      book={book}
                      isFavorite={favorites.some((favorite) => favorite.bookID === book.bookID)}
                      coverSrc={book.coverUrl}
                      title={book.title}
                      storyType={book.storyTypeLabel || book.category}
                      description={book.description}
                      rating={ratingMap[book.bookID]}
                      onClick={() => handlePersonalize(book.bookID)}
                      onFavoriteClick={(event) => {
                        event.stopPropagation()
                        toggleFavorite(book)
                      }}
                    />
                  ))}
                </div>

                {category.afterBanner ? <CategoryBanner banner={category.afterBanner} /> : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
