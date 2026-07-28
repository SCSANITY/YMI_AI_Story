import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell } from '@/components/legal/LegalPageShell'
import { getPublishedLegalDocuments } from '@/lib/published-legal-content'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Legal',
  description:
    'Find YMI Story privacy, terms, shipping, refund, and cookie information.',
  path: '/legal',
})

export default async function LegalPage() {
  const documents = await getPublishedLegalDocuments()

  return (
    <LegalPageShell
      eyebrow="YMI Story Legal"
      title="Policies and terms"
      description="Review the policies that govern how YMI Story protects your information, provides personalized products, and fulfills your orders."
    >
      <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {documents.map((document) => (
          <section
            key={document.key}
            className="grid gap-4 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8"
          >
            <div>
              <h2 className="text-xl font-semibold text-slate-950">{document.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {document.description}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                Effective {document.effectiveDate} · Version {document.version}
              </p>
            </div>
            <Link
              href={document.path}
              className="inline-flex h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Read policy
            </Link>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm leading-6 text-slate-600 shadow-sm sm:px-8">
        <h2 className="text-base font-semibold text-slate-950">Contact</h2>
        <p className="mt-2">
          For legal or privacy questions, email{' '}
          <a
            href="mailto:admin@ymistory.com"
            className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 hover:text-amber-800"
          >
            admin@ymistory.com
          </a>
          .
        </p>
      </section>
    </LegalPageShell>
  )
}
