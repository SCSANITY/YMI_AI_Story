
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Footer } from '@/components/Footer';
import { HomeBookCategories } from '@/components/HomeBookCategories';
import { HomeBooksHashRedirect } from '@/components/HomeBooksHashRedirect';
import { getPublishedHomepageBanners } from '@/lib/homepage-banners';
import { getMultiBookOfferRule } from '@/lib/multi-book-offer';
import { LaunchOfferBanner } from '@/components/LaunchOfferBanner';
import { DEFAULT_SITE_TITLE, publicPageMetadata } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: 'Personalized Children\'s Storybooks',
  absoluteTitle: DEFAULT_SITE_TITLE,
  description: 'Create magical personalized storybooks where your child becomes the hero through AI-powered illustrated previews, keepsake PDFs, and family-ready storytelling.',
  path: '/',
});

export default async function HomePage() {
  const [banners, multiBookRule] = await Promise.all([
    getPublishedHomepageBanners(),
    // Fail-closed: a rule read error simply renders no banner this paint.
    getMultiBookOfferRule().catch(() => null),
  ]);

  return (
    <>
      <HomeBooksHashRedirect />
      <LaunchOfferBanner rule={multiBookRule} />
      <Hero />
      <HomeBookCategories banners={banners} />
      <Footer />
    </>
  );
}
