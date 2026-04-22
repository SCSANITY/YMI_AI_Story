'use client';

import { useRouter } from 'next/navigation';

type HomePosterBannerProps = {
  src: string;
  mobileSrc?: string;
  alt: string;
  width: number;
  height: number;
  aspectClassName: string;
  hotspotClassName: string;
  href?: string;
  priority?: boolean;
  className?: string;
};

export function HomePosterBanner({
  src,
  mobileSrc,
  alt,
  width,
  height,
  aspectClassName,
  hotspotClassName,
  href = '/books',
  priority = false,
  className = '',
}: HomePosterBannerProps) {
  const router = useRouter();

  const handleHotspotClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (href.startsWith('#')) {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    router.push(href);
  };

  return (
    <section className={`relative w-full overflow-hidden ${className}`.trim()}>
      <div className={`relative w-full ${aspectClassName}`.trim()}>
        <picture className="block h-full w-full">
          {mobileSrc ? <source media="(max-width: 767px)" srcSet={mobileSrc} /> : null}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="block h-full w-full object-cover"
          />
        </picture>
        <a
          href={href}
          onClick={handleHotspotClick}
          aria-label="Create their story and jump to our books collection"
          className={`absolute block -translate-y-1/2 rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${hotspotClassName}`.trim()}
        />
      </div>
    </section>
  );
}
