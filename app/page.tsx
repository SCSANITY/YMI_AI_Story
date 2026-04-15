
import { Hero } from '@/components/Hero';
import { BookList } from '@/components/BookList';
import { Footer } from '@/components/Footer';
import { HomePosterBanner } from '@/components/HomePosterBanner';

export default function HomePage() {
  return (
    <>
      <Hero />
      <HomePosterBanner
        src="/banners/banner-02.png"
        alt="YMI promotional banner"
        width={6000}
        height={2000}
        aspectClassName="aspect-[3/1]"
        hotspotClassName="left-[39.8%] top-[65.8%] h-[15.8%] w-[22.8%]"
        className="-mt-1 md:-mt-2"
      />
      <BookList />
      <HomePosterBanner
        src="/banners/banner-01.png"
        alt="YMI promotional banner"
        width={7559}
        height={2268}
        aspectClassName="aspect-[7559/2268]"
        hotspotClassName="left-[39.8%] top-[65.8%] h-[15.8%] w-[22.8%]"
        className="mt-8 md:mt-10"
      />
      <Footer />
    </>
  );
}
