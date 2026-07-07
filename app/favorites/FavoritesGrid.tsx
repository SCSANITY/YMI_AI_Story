'use client';

import type React from 'react';
import { BookCard } from '@/components/BookCard';
import type { Book } from '@/types';

type FavoritesGridProps = {
  books: Book[];
  coverMap: Record<string, string>;
  titleMap: Record<string, string>;
  typeMap: Record<string, string>;
  descMap: Record<string, string>;
  getPersonalizeHref: (bookId: string) => string;
  pendingCustomizeHref: string | null;
  onPersonalize: (bookId: string) => void;
  onPrefetch: (href: string) => void;
  onToggleFavorite: (book: Book, event: React.MouseEvent) => void;
};

export function FavoritesGrid({
  books,
  coverMap,
  titleMap,
  typeMap,
  descMap,
  getPersonalizeHref,
  pendingCustomizeHref,
  onPersonalize,
  onPrefetch,
  onToggleFavorite,
}: FavoritesGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-10">
      {books.map((book) => {
        const personalizeHref = getPersonalizeHref(book.bookID);

        return (
          <BookCard
            key={book.bookID}
            book={book}
            isFavorite={true}
            coverSrc={coverMap[book.bookID] || book.coverUrl}
            title={titleMap[book.bookID] || book.title}
            storyType={typeMap[book.bookID] || book.category}
            description={descMap[book.bookID] || book.description}
            isNavigating={pendingCustomizeHref === personalizeHref}
            onClick={() => onPersonalize(book.bookID)}
            onPrefetch={() => onPrefetch(personalizeHref)}
            onFavoriteClick={(event) => onToggleFavorite(book, event)}
          />
        );
      })}
    </div>
  );
}
