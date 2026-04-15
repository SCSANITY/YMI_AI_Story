'use client'
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGlobalContext } from '../contexts/GlobalContext';
import { BOOKS } from '@/data/books';
import { Book } from '@/types';
import { Heart, Search, Sparkles, Filter, X } from 'lucide-react';
import { Button } from './Button';
import { BookCardCover } from './BookCardCover';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/useI18n';

const VALUE_OPTIONS = [
  'Self-Awareness',
  'Emotional Intelligence',
  'Social Skills',
  'Creativity',
  'Problem-Solving',
  'Adaptability',
  'Resilience and Perseverance',
  'Responsibility and Habits',
  'Curiosity and Exploration',
  'Play and Learning',
  'Spiritual/Inner Growth',
] as const


function GlassSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = value !== 'All'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={ref} className="relative flex-1">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center h-9 rounded-full border px-3 w-full gap-1.5 transition-colors ${active ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-amber-200'}`}
      >
        <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${active ? 'text-amber-600' : 'text-gray-400'}`}>
          {label}
        </span>
        <span className={`flex-1 text-center text-xs font-medium ${active ? 'text-amber-800' : 'text-gray-400'}`}>
          {selectedLabel}
        </span>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 min-w-[130px] rounded-xl border border-white/50 bg-white/88 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`block w-full text-center px-4 py-2 text-xs transition-colors hover:bg-amber-50/80 ${value === opt.value ? 'font-bold text-amber-700' : 'text-gray-600'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const BookList: React.FC = () => {
  const { toggleFavorite, favorites } = useGlobalContext();
  const { t } = useI18n();
  const [coverMap, setCoverMap] = useState<Record<string, string>>({});
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [descMap, setDescMap] = useState<Record<string, string>>({});
  const [ratingMap, setRatingMap] = useState<Record<string, { average: number; count: number }>>({});

  // Filter States
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [age, setAge] = useState('All');
  const [gender, setGender] = useState('All');
  const [suppressCardHover, setSuppressCardHover] = useState(false);
  const hoverResumeTimerRef = useRef<number | null>(null);
  

  // Derive unique options from data
  const categories = ['All', ...VALUE_OPTIONS];
  const ageRanges = ['All', ...Array.from(new Set(BOOKS.map(b => b.ageRange))).sort()];
  const genders = ['All', ...Array.from(new Set(BOOKS.map(b => b.gender)))];

  // Filter Logic
  const filteredBooks = useMemo(() => {
    return BOOKS.filter(book => {
      const storyType = typeMap[book.bookID] ?? '';
      const matchesSearch = book.title.toLowerCase().includes(search.toLowerCase()) || 
                            book.author.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || storyType === category;
      const matchesAge = age === 'All' || book.ageRange === age;
      const matchesGender = gender === 'All' || book.gender === gender;

      return matchesSearch && matchesCategory && matchesAge && matchesGender;
    });
  }, [search, category, age, gender, typeMap]);

  const pauseCardHover = () => {
    setSuppressCardHover(true);
    if (hoverResumeTimerRef.current !== null) {
      window.clearTimeout(hoverResumeTimerRef.current);
    }
    hoverResumeTimerRef.current = window.setTimeout(() => {
      setSuppressCardHover(false);
      hoverResumeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (hoverResumeTimerRef.current !== null) {
        window.clearTimeout(hoverResumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    type TemplateRow = {
      template_id?: string | null
      name?: string | null
      story_type?: string | null
      description?: string | null
      cover_image_path?: string | null
    }

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

      ;(data as TemplateRow[]).forEach((row) => {
        if (row?.template_id && row?.name) {
          titleLookup[row.template_id] = String(row.name);
        }

        if (row?.template_id && row?.story_type) {
          typeLookup[row.template_id] = String(row.story_type);
        }

        if (row?.template_id && row?.description) {
          descLookup[row.template_id] = String(row.description);
        }

        if (!row?.template_id) return;
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

    fetch('/api/reviews/summary', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { summary: {} }))
      .then((data) => {
        if (!isMounted) return;
        const summary = data?.summary ?? {};
        if (summary && typeof summary === 'object') {
          setRatingMap(summary as Record<string, { average: number; count: number }>);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setRatingMap({});
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFavoriteClick = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    toggleFavorite(book);
  };

const router = useRouter();


const handlePersonalize = (bookID: string) => {
    if (!bookID) {
    console.error('[Personalize] bookID missing', bookID);
    return;
  }
  router.push(`/personalize/${bookID}`);
};

  
  const activeFilterCount = [category, age, gender].filter(x => x !== 'All').length;

  const categoryOptions = categories.map(c => ({ value: c, label: c === 'All' ? t('category.All') : c }))
  const ageOptions = ageRanges.map(a => ({ value: a, label: a === 'All' ? t('category.All') : `${a} ${t('common.yearsSuffix')}` }))
  const genderOptions = genders.map(g => ({ value: g, label: t(`gender.${g}`) }))

  return (
    <section id="books" className="page-surface page-surface--flush-bottom pt-12 md:pt-24 pb-0 min-h-screen">
      <div className="container mx-auto px-4 md:px-6 lg:px-12">
        
        {/* Section Header */}
        <div className="mb-10 md:mb-16 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500 mb-3">
            Our Collection
          </p>
          <h2 className="text-3xl md:text-5xl font-title text-gray-900 leading-tight mb-4">
            {t('bookList.heading')}
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            {t('bookList.subheading')}
          </p>
        </div>

        {/* Filter Bar */}
        <div className="sticky top-16 md:top-20 z-30 mb-8 md:mb-12">
          <div className="bg-white/45 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] px-4 md:px-6 py-3.5">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">

              {/* Search */}
              <div className="relative w-64 md:w-96 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('bookList.searchPlaceholder')}
                  value={search}
                  onChange={(e) => {
                    pauseCardHover();
                    setSearch(e.target.value);
                  }}
                  className="w-full pl-9 h-10 rounded-full border border-gray-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 focus:bg-white transition-colors"
                />
              </div>

              <div className="hidden sm:block w-px h-6 bg-amber-100 shrink-0" />

              {/* Glass selects */}
              <div className="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
                <GlassSelect label={t('bookList.filterType')} value={category} options={categoryOptions} onChange={(value) => { pauseCardHover(); setCategory(value); }} />
                <GlassSelect label={t('bookList.filterAge')} value={age} options={ageOptions} onChange={(value) => { pauseCardHover(); setAge(value); }} />
                <GlassSelect label={t('bookList.filterFor')} value={gender} options={genderOptions} onChange={(value) => { pauseCardHover(); setGender(value); }} />

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { pauseCardHover(); setCategory('All'); setAge('All'); setGender('All'); }}
                    className="flex items-center gap-1 h-9 px-3 rounded-full border border-red-200 bg-red-50 text-xs text-red-500 hover:bg-red-100 transition-colors shrink-0"
                  >
                    <X className="h-3 w-3" /> {t('bookList.clearFilters')}
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Results Grid - Adjusted for Mobile 2-columns (4 books per view) */}
        {filteredBooks.length === 0 ? (
          <div className="text-center py-20">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">{t('bookList.noBooksTitle')}</h3>
            <p className="text-gray-500">{t('bookList.noBooksDescription')}</p>
            <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => {
                    pauseCardHover();
                    setSearch('');
                    setCategory('All');
                    setAge('All');
                    setGender('All');
                }}
            >
                {t('bookList.clearAllFilters')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-10">
            <AnimatePresence>
                {filteredBooks.map((book) => {
                const isFavorite = favorites.some(f => f.bookID === book.bookID);
                const coverSrc = coverMap[book.bookID] || book.coverUrl;
                
                return (
                    <motion.div
                    key={book.bookID}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className={`group relative isolate flex flex-col h-full overflow-visible cursor-pointer transition-transform duration-300 ease-out ${
                      suppressCardHover ? '' : 'md:hover:-translate-y-1 book-card-hoverable'
                    }`}
                    onClick={() => handlePersonalize(book.bookID)}
                    >
                    {/* Book cover — z-10 so its shadow falls onto the card below */}
                    <BookCardCover
                        src={coverSrc}
                        alt={titleMap[book.bookID] || book.title}
                        loading="lazy"
                        decoding="async"
                        coverZoom={book.coverZoom}
                    >
                        {/* Favorite Button */}
                        <button
                            onClick={(e) => handleFavoriteClick(e, book)}
                            className="absolute top-2 right-2 z-20 md:top-3 md:right-3 p-1.5 md:p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all transform active:scale-90 opacity-100 md:opacity-0 group-hover:opacity-100 translate-y-0 md:translate-y-2 group-hover:translate-y-0"
                        >
                            <Heart
                                className={`h-4 w-4 md:h-5 md:w-5 transition-colors ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-gray-600'}`}
                            />
                        </button>
                    </BookCardCover>

                    {/* Content card — pulled up under the book, shadow falls on its surface */}
                    <div className="glass-panel relative z-20 rounded-xl md:rounded-2xl flex flex-col flex-1 -mt-3 md:-mt-6 pt-8 md:pt-14 px-3 md:px-5 pb-3 md:pb-5">
                        <div className="flex flex-col flex-1">
                            <h3 className="font-display text-sm md:text-lg font-medium text-gray-900 leading-tight mb-1 md:mb-2 line-clamp-2 md:line-clamp-none">{titleMap[book.bookID] || book.title}</h3>
                            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 md:mb-3">{typeMap[book.bookID] || book.category}</p>
                            <p className="text-sm text-gray-600 leading-relaxed hidden md:block">{descMap[book.bookID] || book.description}</p>
                        </div>
                        
                        <div className="mt-auto pt-2 md:pt-4 border-t border-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                                <span className="text-[10px] md:text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 md:px-3 md:py-1 rounded-full whitespace-nowrap">{book.ageRange} {t('common.yearsSuffix')}</span>
                            <div className="flex items-center gap-2">
                                {ratingMap[book.bookID]?.count ? (
                                  <div className="text-[10px] md:text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">
                                    {t('bookList.rating')} {ratingMap[book.bookID].average.toFixed(1)} ({ratingMap[book.bookID].count})
                                  </div>
                                ) : null}
                                <div className="flex items-center gap-1 text-amber-600 text-[10px] md:text-sm font-bold">
                                    <span className="md:inline">{t('bookList.create')}</span> <Sparkles className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </div>
                    </motion.div>
                );
                })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
};
