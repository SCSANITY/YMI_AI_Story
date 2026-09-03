import Link from 'next/link'
import type { ReactNode } from 'react'
import { Footer } from '@/components/Footer'
import { LegalCookieSettingsButton } from '@/components/legal/LegalCookieSettingsButton'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import { getPublishedLegalDocuments } from '@/lib/published-legal-content'

type LegalPageShellProps = {
  activeDocument?: CanonicalLegalDocumentKey
  eyebrow: string
  title: string
  description: string
  meta?: ReactNode
  children: ReactNode
}

const linkClassName =
  'rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'

export async function LegalPageShell({
  activeDocument,
  eyebrow,
  title,
  description,
  meta,
  children,
}: LegalPageShellProps) {
  const documents = await getPublishedLegalDocuments()

  return (
    <>
      <main className="page-surface page-surface--flush-bottom min-h-screen">
        <header className="border-b border-amber-100/80 bg-white/72">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-700">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-4xl font-title text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              {description}
            </p>
            {meta ? (
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                {meta}
              </div>
            ) : null}
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Legal documents" className="flex flex-wrap gap-1 lg:flex-col">
              <Link
                href="/legal"
                aria-current={activeDocument ? undefined : 'page'}
                className={`${linkClassName} ${activeDocument ? '' : 'bg-white text-amber-800 shadow-sm'}`}
              >
                Legal overview
              </Link>
              {documents.map((document) => (
                <Link
                  key={document.key}
                  href={document.path}
                  aria-current={activeDocument === document.key ? 'page' : undefined}
                  className={`${linkClassName} ${
                    activeDocument === document.key
                      ? 'bg-white text-amber-800 shadow-sm'
                      : ''
                  }`}
                >
                  {document.shortTitle}
                </Link>
              ))}
              <LegalCookieSettingsButton className={`${linkClassName} text-left`} />
            </nav>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  )
}
