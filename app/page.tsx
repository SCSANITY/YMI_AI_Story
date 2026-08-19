
import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { Footer } from '@/components/Footer';
import { HomePosterBanner } from '@/components/HomePosterBanner';
import { HomeBookCategories } from '@/components/HomeBookCategories';
import { HomeBooksHashRedirect } from '@/components/HomeBooksHashRedirect';
import { getPublishedHomepageBanners } from '@/lib/homepage-banners';
import { DEFAULT_SITE_TITLE, publicPageMetadata } from '@/lib/seo';

export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: 'Personalized Children\'s Storybooks',
  absoluteTitle: DEFAULT_SITE_TITLE,
  description: 'Create magical personalized storybooks where your child becomes the hero through AI-powered illustrated previews, keepsake PDFs, and family-ready storytelling.',
  path: '/',
});

export default async function HomePage() {
  const banners = await getPublishedHomepageBanners();

  return (
    <>
      <HomeBooksHashRedirect />
      <Hero />
      <HomePosterBanner
        banner={banners.after_hero}
        className="-mt-2 bg-[var(--color-surface-warm)] md:-mt-3"
      />
      <HomeBookCategories banners={banners} />
      <Footer />
    </>
  );
}
