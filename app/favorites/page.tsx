'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Sparkles } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { BookCardCover } from '@/components/BookCardCover';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/useI18n';
import { formatLocaleCurrency } from '@/lib/locale-pricing';

export default function FavoritesPage() {
  const router = useRouter();
  const { t, language } = useI18n();
  const { favorites, toggleFavorite, user, isHydrated } = useGlobalContext();
  const [coverMap, setCoverMap] = useState<Record<string, string>>({});
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [descMap, setDescMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    const loadCovers = async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true);

      if (!isMounted) return;
      if (error || !data) return;

      const coverLookup: Record<string, string> = {};
      const titleLookup: Record<string, string> = {};
      const typeLookup: Record<string, string> = {};
      const descLookup: Record<string, string> = {};

      data.forEach((row: any) => {
        if (row?.template_id && row?.name) {
          titleLookup[row.template_id] = String(row.name);
        }

        if (row?.template_id && row?.story_type) {
          typeLookup[row.template_id] = String(row.story_type);
        }

        if (row?.template_id && row?.description) {
          descLookup[row.template_id] = String(row.description);
        }

        const rawPath = String(row.normalized_cover_image_path || row.cover_image_path || '').trim();
        if (!rawPath) return;
        if (rawPath.startsWith('http')) {
          coverLookup[row.template_id] = rawPath;
          return;
        }
        const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '');
        const { data: publicUrl } = supabase.storage
          .from('app-templates')
          .getPublicUrl(cleaned);
        if (publicUrl?.publicUrl) {
          coverLookup[row.template_id] = publicUrl.publicUrl;
        }
      });

      setCoverMap(coverLookup);
      setTitleMap(titleLookup);
      setTypeMap(typeLookup);
      setDescMap(descLookup);
    };

    loadCovers();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isHydrated) {
    return <div className="page-surface min-h-screen" />;
  }

  if (favorites.length === 0) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Heart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('favorites.emptyTitle')}</h1>
          <p className="text-gray-600">{t('favorites.emptyDescription')}</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/books')}>{t('common.browseBooks')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Heart className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('favorites.title')}</h1>
          <p className="text-gray-500 text-sm">{t('favorites.subtitle')}</p>
        </div>
      </div>
      {!user && (
        <div className="mb-6 text-xs text-gray-500">
          {t('favorites.syncHint')}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-8">
        {favorites.map((book) => {
          const coverSrc = coverMap[book.bookID] || book.coverUrl
          const priceLabel = formatLocaleCurrency(book.price, language)
          const compareAtPrice = book.compareAtPrice && book.compareAtPrice > book.price ? book.compareAtPrice : null
          const compareAtLabel = compareAtPrice ? formatLocaleCurrency(compareAtPrice, language) : null
          const discountPercent =
            book.discountPercent ??
            (compareAtPrice ? Math.round((1 - book.price / compareAtPrice) * 100) : null)
          const isDiscounted = Boolean((book.isDiscount || compareAtPrice) && discountPercent && discountPercent > 0)

          return (
          <div
            key={book.bookID}
            className="group book-card-hoverable relative isolate flex flex-col h-full overflow-visible cursor-pointer transition-transform duration-300 ease-out md:hover:-translate-y-1"
            onClick={() => router.push(`/personalize/${book.bookID}`)}
          >
            <BookCardCover src={coverSrc} alt={titleMap[book.bookID] || book.title} coverZoom={book.coverZoom}>
              {isDiscounted ? (
                <div className="absolute left-2 top-2 z-20 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white shadow-lg shadow-orange-300/30 md:left-auto md:right-12 md:top-3 md:px-3.5 md:py-1.5 md:text-sm">
                  -{discountPercent}%
                </div>
              ) : null}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(book);
                }}
                className="absolute top-2 right-2 z-20 md:top-3 md:right-3 p-1.5 md:p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all transform active:scale-90 opacity-100 md:opacity-0 group-hover:opacity-100 translate-y-0 md:translate-y-2 group-hover:translate-y-0"
              >
                <Heart className="h-4 w-4 md:h-5 md:w-5 fill-red-500 text-red-500" />
              </button>
            </BookCardCover>

            <div className="glass-panel rounded-xl md:rounded-2xl flex flex-col flex-1 -mt-4 md:-mt-6 pt-10 md:pt-14 px-3 md:px-5 pb-3 md:pb-5">
              <div className="flex flex-col flex-1">
                <h3 className="font-display pt-px md:pt-0 text-sm md:text-lg font-medium text-gray-900 leading-snug md:leading-tight mb-1 md:mb-2 group-hover:text-amber-600 transition-colors line-clamp-2 md:line-clamp-none">
                  {titleMap[book.bookID] || book.title}
                </h3>
                <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 md:mb-3">
                  {typeMap[book.bookID] || book.category}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed hidden md:block">
                  {descMap[book.bookID] || book.description}
                </p>
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-50 pt-3 md:pt-4">
                <div className="min-w-0">
                  {isDiscounted ? (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="whitespace-nowrap text-base font-extrabold tracking-wide text-amber-600 md:text-lg">
                        {priceLabel}
                      </span>
                      {compareAtLabel ? (
                        <span className="whitespace-nowrap text-xs font-semibold text-gray-400 line-through md:text-sm">
                          {compareAtLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:text-sm">
                        {t('bookList.from')}
                      </span>
                      <span className="whitespace-nowrap text-base font-extrabold tracking-wide text-amber-600 md:text-lg">
                        {priceLabel}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="rounded-full px-4 py-1.5 text-[10px] md:text-xs font-semibold"
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(`/personalize/${book.bookID}`);
                  }}
                >
                  <Sparkles className="h-3 w-3 mr-1" /> {t('favorites.personalize')}
                </Button>
              </div>
            </div>
          </div>
        )})}
      </div>
      </div>
    </div>
  );
}
