'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/useI18n';
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation';
import { FavoritesGrid } from './FavoritesGrid';

function FavoritesLoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-10" aria-label="Loading favorites">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[22px] border border-white/70 bg-white/75 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        >
          <div className="aspect-[3/4] animate-pulse bg-gradient-to-br from-amber-50 via-orange-50 to-white" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-gray-200" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-gray-100" />
            <div className="h-9 w-full animate-pulse rounded-full bg-amber-100/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { favorites, isFavoritesLoading, toggleFavorite, user, isHydrated } = useGlobalContext();
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation();
  const [coverMap, setCoverMap] = useState<Record<string, string>>({});
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [descMap, setDescMap] = useState<Record<string, string>>({});

  const getPersonalizeHref = (bookID: string) => `/personalize/${bookID}`;

  const handlePersonalize = (bookID: string) => {
    void navigateToCustomize(getPersonalizeHref(bookID));
  };

  useEffect(() => {
    let isMounted = true;

    const loadTemplateData = async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true);

      if (!isMounted || error || !data) return;

      const covers: Record<string, string> = {};
      const titles: Record<string, string> = {};
      const types: Record<string, string> = {};
      const descs: Record<string, string> = {};

      data.forEach((row: any) => {
        if (!row?.template_id) return;
        if (row.name) titles[row.template_id] = String(row.name);
        if (row.story_type) types[row.template_id] = String(row.story_type);
        if (row.description) descs[row.template_id] = String(row.description);
        const rawPath = String(row.normalized_cover_image_path || row.cover_image_path || '').trim();
        if (!rawPath) return;
        if (rawPath.startsWith('http')) {
          covers[row.template_id] = rawPath;
          return;
        }
        const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '');
        const { data: pub } = supabase.storage.from('app-templates').getPublicUrl(cleaned);
        if (pub?.publicUrl) covers[row.template_id] = pub.publicUrl;
      });

      setCoverMap(covers);
      setTitleMap(titles);
      setTypeMap(types);
      setDescMap(descs);
    };

    loadTemplateData();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Heart className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('favorites.title')}</h1>
            <p className="text-gray-500 text-sm">{t('favorites.subtitle')}</p>
          </div>
        </div>

        {isHydrated && !user && (
          <div className="mb-6 text-xs text-gray-500">{t('favorites.syncHint')}</div>
        )}

        {!isHydrated || isFavoritesLoading ? (
          <FavoritesLoadingGrid />
        ) : favorites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Heart className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-xl md:text-2xl font-title text-gray-900">{t('favorites.emptyTitle')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{t('favorites.emptyDescription')}</p>
            <Button size="lg" className="mt-6 rounded-full px-8" onClick={() => router.push('/books')}>
              {t('common.browseBooks')}
            </Button>
          </div>
        ) : (
          <FavoritesGrid
            books={favorites}
            coverMap={coverMap}
            titleMap={titleMap}
            typeMap={typeMap}
            descMap={descMap}
            getPersonalizeHref={getPersonalizeHref}
            pendingCustomizeHref={pendingCustomizeHref}
            onPersonalize={handlePersonalize}
            onPrefetch={prefetchCustomizeHref}
            onToggleFavorite={(book, event) => {
              event.stopPropagation();
              toggleFavorite(book);
            }}
          />
        )}
      </div>
    </div>
  );
}
