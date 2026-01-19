import './globals.css';
import { GlobalProvider } from '@/contexts/GlobalContext';
import { Navbar } from '@/components/Navbar';
import { LoginModal } from '@/components/LoginModal';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <GlobalProvider>
          <Navbar />
          <LoginModal />
          {children}
        </GlobalProvider>
      </body>
    </html>
  );
}
