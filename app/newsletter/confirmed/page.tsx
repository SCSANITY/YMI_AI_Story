import Link from 'next/link'

export default function NewsletterConfirmedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f7f5] px-5 py-16">
      <section className="w-full max-w-lg rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-gray-950">Subscription confirmed</h1>
        <p className="mt-4 leading-7 text-gray-600">You will now receive YMI Story news and new story releases.</p>
        <Link href="/" className="mt-7 inline-flex h-11 items-center rounded-md bg-amber-400 px-5 font-semibold text-gray-950 hover:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">
          Return home
        </Link>
      </section>
    </main>
  )
}
