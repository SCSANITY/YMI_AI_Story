'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Sparkles } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';

export default function FavoritesPage() {
  const router = useRouter();
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

        const rawPath = String(row.cover_image_path || '').trim();
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
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">No favorites yet</h1>
          <p className="text-gray-600">Browse the collection and tap the heart to save a book.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/')}>Browse Books</Button>
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
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">My Favorites</h1>
          <p className="text-gray-500 text-sm">Your saved storybooks.</p>
        </div>
      </div>
      {!user && (
        <div className="mb-6 text-xs text-gray-500">
          Log in to sync your favorites across devices.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-8">
        {favorites.map((book) => (
          <div
            key={book.bookID}
            className="group flex flex-col h-full glass-panel rounded-xl md:rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer"
            onClick={() => router.push(`/personalize/${book.bookID}`)}
          >
            <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              <img
                src={coverMap[book.bookID] || book.coverUrl}
                alt={titleMap[book.bookID] || book.title}
                className="h-full w-full object-cover"
              />

              <div className="absolute top-2 left-2 md:top-3 md:left-3 flex gap-2">
                <span className="px-1.5 py-0.5 md:px-2 md:py-1 bg-white/90 backdrop-blur-sm text-[8px] md:text-[10px] font-bold uppercase tracking-wider rounded-md text-gray-800 shadow-sm">
                  {typeMap[book.bookID] || book.category}
                </span>
              </div>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(book);
                }}
                className="absolute top-2 right-2 md:top-3 md:right-3 p-1.5 md:p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all transform active:scale-90 opacity-100 md:opacity-0 group-hover:opacity-100 translate-y-0 md:translate-y-2 group-hover:translate-y-0"
              >
                <Heart className="h-4 w-4 md:h-5 md:w-5 fill-red-500 text-red-500" />
              </button>
            </div>

            <div className="flex flex-col flex-1 p-3 md:p-6">
              <div className="flex flex-col flex-1">
                <h3 className="font-display text-sm md:text-lg font-medium text-gray-900 leading-tight mb-1 md:mb-2 group-hover:text-amber-600 transition-colors line-clamp-2 md:line-clamp-none">
                  {titleMap[book.bookID] || book.title}
                </h3>
                <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 md:mb-3">
                  {book.author}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed hidden md:block">
                  {descMap[book.bookID] || book.description}
                </p>
              </div>

              <div className="mt-auto pt-2 md:pt-4 border-t border-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                <span className="text-[10px] md:text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 md:px-3 md:py-1 rounded-full whitespace-nowrap">
                  {book.ageRange} Years
                </span>
                <Button
                  size="sm"
                  className="rounded-full px-4 py-1.5 text-[10px] md:text-xs font-semibold"
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(`/personalize/${book.bookID}`);
                  }}
                >
                  <Sparkles className="h-3 w-3 mr-1" /> Personalize
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
