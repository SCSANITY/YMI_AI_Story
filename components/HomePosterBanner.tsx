'use client';

import Image from 'next/image';

export function HomePosterBanner() {
  const handleJumpToBooks = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative mt-10 md:mt-14 w-full overflow-hidden">
      <div className="relative aspect-[10/3] w-full">
        <Image
          src="/banners/banner-01.jpeg"
          alt="YMI promotional banner"
          width={1600}
          height={480}
          sizes="100vw"
          className="h-full w-full object-cover"
          priority
        />
        <a
          href="#books"
          onClick={handleJumpToBooks}
          aria-label="Create their story and jump to our books collection"
          className="absolute left-[39.8%] top-[65.8%] block h-[15.8%] w-[22.8%] -translate-y-1/2 rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        />
      </div>
    </section>
  );
}
