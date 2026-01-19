'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Sparkles } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function FavoritesPage() {
  const router = useRouter();
  const { favorites, toggleFavorite, user, openLoginModal } = useGlobalContext();

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Heart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Log in to see favorites</h1>
          <p className="text-gray-600">Save books you love and come back anytime.</p>
          <Button size="lg" className="rounded-full px-8" onClick={openLoginModal}>Log In</Button>
        </div>
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Heart className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">No favorites yet</h1>
          <p className="text-gray-600">Browse the collection and tap the heart to save a book.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/')}>Browse Books</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Heart className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">My Favorites</h1>
          <p className="text-gray-500 text-sm">Your saved storybooks.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {favorites.map((book) => (
          <div key={book.bookID} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="relative aspect-[3/4]">
              <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
              <button
                className="absolute top-3 right-3 p-2 bg-white/90 rounded-full shadow"
                onClick={() => toggleFavorite(book)}
              >
                <Heart className="h-4 w-4 text-red-500 fill-red-500" />
              </button>
            </div>
            <div className="p-4">
              <h2 className="font-serif text-lg font-bold text-gray-900">{book.title}</h2>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{book.author}</p>
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{book.description}</p>
              <Button
                size="sm"
                className="mt-4 rounded-full"
                onClick={() => router.push(`/personalize/${book.bookID}`)}
              >
                <Sparkles className="h-4 w-4 mr-2" /> Personalize
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
