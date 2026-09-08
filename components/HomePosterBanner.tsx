import Link from 'next/link';
import { getImageProps } from 'next/image';
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
  const commonImageProps = {
    alt: banner.altText,
    sizes: '100vw',
    loading: priority ? 'eager' as const : 'lazy' as const,
    fetchPriority: priority ? 'high' as const : 'auto' as const,
  };
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({
    ...commonImageProps,
    src: banner.desktop.src,
    width: banner.desktop.width,
    height: banner.desktop.height,
  });
  const {
    props: { srcSet: mobileSrcSet, ...mobileImageProps },
  } = getImageProps({
    ...commonImageProps,
    src: banner.mobile.src,
    width: banner.mobile.width,
    height: banner.mobile.height,
  });

  return (
    <section className={`relative w-full overflow-hidden ${className}`.trim()}>
      <div className="relative w-full">
        <picture className="block w-full">
          <source
            media="(max-width: 767px)"
            srcSet={mobileSrcSet}
            width={banner.mobile.width}
            height={banner.mobile.height}
          />
          <img
            {...mobileImageProps}
            src={banner.desktop.src}
            srcSet={desktopSrcSet}
            alt={banner.altText}
            width={banner.desktop.width}
            height={banner.desktop.height}
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
