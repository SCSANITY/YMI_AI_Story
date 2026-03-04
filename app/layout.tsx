import './globals.css';
import { GlobalProvider } from '@/contexts/GlobalContext';
import { Navbar } from '@/components/Navbar';
import { LoginModal } from '@/components/LoginModal';
import { Cutive, Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-inter',
});

const cutive = Cutive({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-cutive',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-playfair',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${cutive.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-white text-gray-900 font-sans">
        <GlobalProvider>
          <Navbar />
          <LoginModal />
          {children}
        </GlobalProvider>
      </body>
    </html>
  );
}
