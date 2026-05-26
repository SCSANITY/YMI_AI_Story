import Link from 'next/link'
import PersonalizePage from '@/components/PersonalizePage';
import { getCustomizeAccessSettings } from '@/lib/customize-access-server'

function CustomizeBlockedPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-10 md:px-8 md:py-14">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <div className="w-full rounded-[32px] border border-amber-100 bg-white p-8 text-center shadow-[0_30px_120px_rgba(251,146,60,0.16)]">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-600">Private Beta</p>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Customize is temporarily closed</h1>
          <p className="mt-4 text-sm leading-7 text-gray-600">{message}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/books"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02]"
            >
              Browse Books
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-8 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default async function Page({
  params,
}: {
  params: Promise<{ bookID: string }>;
}) {
  const { bookID } = await params;
  const customizeAccess = await getCustomizeAccessSettings()

  if (!customizeAccess.enabled) {
    return <CustomizeBlockedPage message={customizeAccess.message} />
  }

  return <PersonalizePage bookID={bookID} />;
}
