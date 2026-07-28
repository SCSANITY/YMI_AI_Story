import { LegalPageShell } from '@/components/legal/LegalPageShell'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import { getPublishedLegalDocument } from '@/lib/published-legal-content'

export async function LegalDocumentPage({
  documentKey,
}: {
  documentKey: CanonicalLegalDocumentKey
}) {
  const document = await getPublishedLegalDocument(documentKey)

  return (
    <LegalPageShell
      activeDocument={documentKey}
      eyebrow="YMI Story Legal"
      title={document.title}
      description={document.description}
      meta={(
        <>
          <span>Effective date: {document.effectiveDate}</span>
          <span>Version: {document.version}</span>
        </>
      )}
    >
      <article className="rounded-lg border border-slate-200/90 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-9">
        <div className="space-y-8 text-[15px] leading-7 text-slate-700">
          {document.sections.map((section, sectionIndex) => (
            <section key={`${section.title ?? 'introduction'}-${sectionIndex}`}>
              {section.title ? (
                <h2 className="mb-3 text-xl font-semibold text-slate-950">
                  {section.title}
                </h2>
              ) : null}

              {section.paragraphs?.length ? (
                <div className="space-y-3">
                  {section.paragraphs.map((item, paragraphIndex) => (
                    <p key={`paragraph-${sectionIndex}-${paragraphIndex}`}>
                      {item.label ? (
                        <span className="font-semibold text-slate-900">{item.label} </span>
                      ) : null}
                      {item.href ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-4 hover:text-amber-800"
                        >
                          {item.text}
                        </a>
                      ) : item.text}
                    </p>
                  ))}
                </div>
              ) : null}

              {section.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-amber-600">
                  {section.bullets.map((item, bulletIndex) => (
                    <li key={`bullet-${sectionIndex}-${bulletIndex}`}>
                      {item.label ? (
                        <span className="font-semibold text-slate-900">{item.label} </span>
                      ) : null}
                      {item.href ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-4 hover:text-amber-800"
                        >
                          {item.text}
                        </a>
                      ) : item.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-600">
          Questions about this policy? Contact{' '}
          <a
            href="mailto:admin@ymistory.com"
            className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 hover:text-amber-800"
          >
            admin@ymistory.com
          </a>
          .
        </footer>
      </article>
    </LegalPageShell>
  )
}
