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

export default function FavoritesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { favorites, toggleFavorite, user, isHydrated } = useGlobalContext();
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
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/books')}>
            {t('common.browseBooks')}
          </Button>
        </div>
      </div>
    );
  }

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

        {!user && (
          <div className="mb-6 text-xs text-gray-500">{t('favorites.syncHint')}</div>
        )}

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
      </div>
    </div>
  );
}
