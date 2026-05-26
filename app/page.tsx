
import { Hero } from '@/components/Hero';
import { Footer } from '@/components/Footer';
import { HomePosterBanner } from '@/components/HomePosterBanner';
import { HomeBookCategories } from '@/components/HomeBookCategories';
import { HomeBooksHashRedirect } from '@/components/HomeBooksHashRedirect';

export default function HomePage() {
  return (
    <>
      <HomeBooksHashRedirect />
      <Hero />
      <HomePosterBanner
        src="/banners/optimized/banner-01-desktop.webp"
        mobileSrc="/banners/optimized/banner-01-mobile.webp"
        alt="YMI promotional banner"
        width={3200}
        height={1800}
        aspectClassName="aspect-video"
        hotspotClassName="left-[39.8%] top-[65.8%] h-[15.8%] w-[22.8%]"
        href="/books"
        priority
        className="-mt-2 bg-[var(--color-surface-warm)] md:-mt-3"
      />
      <HomeBookCategories />
      <HomePosterBanner
        src="/banners/optimized/banner-02-desktop.webp"
        mobileSrc="/banners/optimized/banner-02-mobile.webp"
        alt="YMI promotional banner"
        width={6000}
        height={2000}
        aspectClassName="aspect-[3/1]"
        hotspotClassName="left-[39.8%] top-[65.8%] h-[15.8%] w-[22.8%]"
        href="/books"
        className="mt-8 md:mt-10"
      />
      <Footer />
    </>
  );
}
