import Link from 'next/link';
import type { PublishedHomepageBanner } from '@/lib/homepage-banners-core';

type HomePosterBannerProps = {
  banner?: PublishedHomepageBanner;
  priority?: boolean;
  className?: string;
};

export function HomePosterBanner({
  banner,
  priority = false,
  className = '',
}: HomePosterBannerProps) {
  if (!banner) return null;

  const overlayClassName =
    'absolute inset-0 block cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-amber-400/70';

  return (
    <section className={`relative w-full overflow-hidden ${className}`.trim()}>
      <div className="relative w-full">
        <picture className="block w-full">
          <source
            media="(max-width: 767px)"
            srcSet={banner.mobile.src}
            width={banner.mobile.width}
            height={banner.mobile.height}
          />
          {/* Direct public assets intentionally avoid the Vercel image optimizer. */}
          <img
            src={banner.desktop.src}
            alt={banner.altText}
            width={banner.desktop.width}
            height={banner.desktop.height}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="block h-auto w-full"
          />
        </picture>
        <Link
          href={banner.href}
          aria-label={banner.displayName}
          className={overlayClassName}
        />
      </div>
    </section>
  );
}
