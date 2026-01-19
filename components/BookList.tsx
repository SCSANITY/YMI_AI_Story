'use client'
import React, { useState, useMemo } from 'react';
import { useGlobalContext } from '../contexts/GlobalContext';
import { BOOKS } from '@/data/books';
import { Book } from '@/types';
import { Heart, Search, Sparkles, Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from './Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';


export const BookList: React.FC = () => {
  const { toggleFavorite, favorites, openLoginModal} = useGlobalContext();

  // Filter States
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [age, setAge] = useState('All');
  const [gender, setGender] = useState('All');
  
  // Mobile Filter Toggle State
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Derive unique options from data
  const categories = ['All', ...Array.from(new Set(BOOKS.map(b => b.category)))];
  const ageRanges = ['All', ...Array.from(new Set(BOOKS.map(b => b.ageRange))).sort()];
  const genders = ['All', ...Array.from(new Set(BOOKS.map(b => b.gender)))];

  // Filter Logic
  const filteredBooks = useMemo(() => {
    return BOOKS.filter(book => {
      const matchesSearch = book.title.toLowerCase().includes(search.toLowerCase()) || 
                            book.author.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || book.category === category;
      const matchesAge = age === 'All' || book.ageRange === age;
      const matchesGender = gender === 'All' || book.gender === gender;

      return matchesSearch && matchesCategory && matchesAge && matchesGender;
    });
  }, [search, category, age, gender]);

  const handleFavoriteClick = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    const result = toggleFavorite(book);
    if (!result.success && result.error === 'login_required') {
      openLoginModal();
    }
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

  return (
    <section id="books" className="py-12 md:py-24 bg-gradient-to-b from-amber-50/50 via-white to-orange-50/30 min-h-screen">
      <div className="container mx-auto px-4 md:px-6 lg:px-12">
        
        <div className="text-center mb-8 md:mb-16">
            <h2 className="text-2xl md:text-5xl font-serif font-bold text-gray-900 mb-2 md:mb-6">Discover Your Next Adventure</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-lg">Browse our collection of personalized stories tailored for every child.</p>
        </div>

        {/* Filter Bar - Optimized for Mobile */}
        <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-sm border border-amber-100 p-3 md:p-6 mb-8 md:mb-16 sticky top-16 md:top-20 z-30 transition-all">
          <div className="flex flex-col md:grid md:grid-cols-4 gap-3 md:gap-6">
            
            {/* Search + Mobile Toggle Row */}
            <div className="flex gap-2 md:col-span-1">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search titles..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 h-10 md:h-12 rounded-lg border border-gray-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:bg-white transition-colors"
                    />
                </div>
                
                {/* Mobile Filter Toggle Button */}
                <button 
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className={`md:hidden flex items-center justify-center px-3 rounded-lg border transition-colors ${showMobileFilters || activeFilterCount > 0 ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600'}`}
                >
                    <Filter className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                        <span className="ml-1 text-[10px] bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">{activeFilterCount}</span>
                    )}
                </button>
            </div>

            {/* Filters - Hidden on mobile unless toggled */}
            <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:contents flex-col gap-3 pt-2 md:pt-0 border-t md:border-0 border-gray-100`}>
                {/* Category */}
                <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider pointer-events-none">Type</span>
                <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full pl-10 md:pl-14 h-10 md:h-12 rounded-lg border border-gray-200 bg-white/50 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 appearance-none cursor-pointer hover:bg-white truncate pr-8 text-gray-700 font-medium"
                >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Age */}
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider pointer-events-none">Age</span>
                    <select 
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="w-full pl-9 md:pl-14 h-10 md:h-12 rounded-lg border border-gray-200 bg-white/50 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 appearance-none cursor-pointer hover:bg-white truncate pr-8 text-gray-700 font-medium"
                    >
                        {ageRanges.map(a => <option key={a} value={a}>{a} Years</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Gender */}
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider pointer-events-none">For</span>
                    <select 
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full pl-9 md:pl-14 h-10 md:h-12 rounded-lg border border-gray-200 bg-white/50 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 appearance-none cursor-pointer hover:bg-white truncate pr-8 text-gray-700 font-medium"
                    >
                        {genders.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
            </div>
            
            {/* Active Filters Clear Button (Mobile Only in expanded view) */}
            {showMobileFilters && activeFilterCount > 0 && (
                <button 
                    onClick={() => {
                        setCategory('All');
                        setAge('All');
                        setGender('All');
                    }}
                    className="md:hidden text-xs text-red-500 font-medium flex items-center justify-center gap-1 py-1"
                >
                    <X className="h-3 w-3" /> Clear Filters
                </button>
            )}
          </div>
        </div>

        {/* Results Grid - Adjusted for Mobile 2-columns (4 books per view) */}
        {filteredBooks.length === 0 ? (
          <div className="text-center py-20">
            <Filter className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No books found</h3>
            <p className="text-gray-500">Try adjusting your filters to find what you are looking for.</p>
            <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => {
                    setSearch('');
                    setCategory('All');
                    setAge('All');
                    setGender('All');
                }}
            >
                Clear all filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-10">
            <AnimatePresence>
                {filteredBooks.map((book) => {
                const isFavorite = favorites.some(f => f.bookID === book.bookID);
                
                return (
                    <motion.div
                    key={book.bookID}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="group flex flex-col h-full bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer"
                    onClick={() => handlePersonalize(book.bookID)}
                    >
                    {/* Image Area */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
                        <img 
                            src={book.coverUrl} 
                            alt={book.title}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        
                        {/* Tags - Smaller on mobile */}
                        <div className="absolute top-2 left-2 md:top-3 md:left-3 flex gap-2">
                             <span className="px-1.5 py-0.5 md:px-2 md:py-1 bg-white/90 backdrop-blur-sm text-[8px] md:text-[10px] font-bold uppercase tracking-wider rounded-md text-gray-800 shadow-sm">
                                {book.category}
                             </span>
                        </div>

                        {/* Favorite Button */}
                        <button 
                            onClick={(e) => handleFavoriteClick(e, book)}
                            className="absolute top-2 right-2 md:top-3 md:right-3 p-1.5 md:p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all transform active:scale-90 opacity-100 md:opacity-0 group-hover:opacity-100 translate-y-0 md:translate-y-2 group-hover:translate-y-0"
                        >
                            <Heart 
                                className={`h-4 w-4 md:h-5 md:w-5 transition-colors ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-gray-600'}`} 
                            />
                        </button>
                    </div>

                    {/* Content Area - Compact on mobile */}
                    <div className="flex flex-col flex-grow p-3 md:p-6">
                        <div className="mb-auto">
                            <h3 className="font-serif text-sm md:text-lg font-bold text-gray-900 leading-tight mb-1 md:mb-2 group-hover:text-amber-600 transition-colors line-clamp-2 md:line-clamp-none">{book.title}</h3>
                            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 md:mb-3">{book.author}</p>
                            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed hidden md:block">{book.description}</p>
                        </div>
                        
                        <div className="mt-2 md:mt-6 pt-2 md:pt-4 border-t border-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 md:px-3 md:py-1 rounded-full whitespace-nowrap">{book.ageRange} Years</span>
                            
                            <div className="flex items-center gap-1 text-amber-600 text-[10px] md:text-sm font-bold opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-0 md:translate-x-2 group-hover:translate-x-0">
                                <span className="md:inline">Create</span> <Sparkles className="h-3 w-3" />
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