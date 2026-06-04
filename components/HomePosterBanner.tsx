import Link from 'next/link';

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
  href = '/books',
  priority = false,
  className = '',
}: HomePosterBannerProps) {
  const overlayClassName =
    'absolute inset-0 block cursor-pointer rounded-[inherit] bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

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
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="block h-full w-full object-cover"
          />
        </picture>
        {href.startsWith('#') ? (
          <a
            href={href}
            aria-label="Create their story and jump to our books collection"
            className={overlayClassName}
          />
        ) : (
          <Link
            href={href}
            aria-label="Create their story and jump to our books collection"
            className={overlayClassName}
          />
        )}
      </div>
    </section>
  );
}
