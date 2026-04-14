'use client';

import Image from 'next/image';

type HomePosterBannerProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  aspectClassName: string;
  hotspotClassName: string;
  priority?: boolean;
  className?: string;
};

export function HomePosterBanner({
  src,
  alt,
  width,
  height,
  aspectClassName,
  hotspotClassName,
  priority = false,
  className = '',
}: HomePosterBannerProps) {
  const handleJumpToBooks = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className={`relative w-full overflow-hidden ${className}`.trim()}>
      <div className={`relative w-full ${aspectClassName}`.trim()}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="100vw"
          className="h-full w-full object-cover"
          priority={priority}
        />
        <a
          href="#books"
          onClick={handleJumpToBooks}
          aria-label="Create their story and jump to our books collection"
          className={`absolute block -translate-y-1/2 rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${hotspotClassName}`.trim()}
        />
      </div>
    </section>
  );
}
