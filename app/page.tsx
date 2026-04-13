
import { Hero } from '@/components/Hero';
import { BookList } from '@/components/BookList';
import { Footer } from '@/components/Footer';
import { HomePosterBanner } from '@/components/HomePosterBanner';

export default function HomePage() {
  return (
    <>
      <Hero />
      <BookList />
      <HomePosterBanner />
      <Footer />
    </>
  );
}
