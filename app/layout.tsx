import './globals.css';
import { AppShell } from '@/components/AppShell';
import { Cutive, Inter, Noto_Sans_TC, Noto_Serif_TC, Playfair_Display } from 'next/font/google';

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

const notoSansTC = Noto_Sans_TC({
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-tc',
});

const notoSerifTC = Noto_Serif_TC({
  weight: ['400', '600', '700'],
  variable: '--font-noto-serif-tc',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cutive.variable} ${playfair.variable} ${notoSansTC.variable} ${notoSerifTC.variable}`}
    >
      <body className="min-h-screen bg-white text-gray-900 font-sans">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
