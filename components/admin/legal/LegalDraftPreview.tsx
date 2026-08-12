import ExternalLink from 'next/link'
import type { LegalRevisionContent } from '@/lib/legal-publishing'

export function LegalDraftPreview({ content }: { content: LegalRevisionContent }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-900 sm:p-7">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Draft preview
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Effective {content.en.effectiveDate} · Version {content.en.version}
        </p>
      </div>
      <div className="mt-6 space-y-7">
        {content.en.sections.map((section, sectionIndex) => (
          <section key={sectionIndex}>
            {section.title ? (
              <h2 className="text-lg font-bold text-slate-950">{section.title}</h2>
            ) : null}
            {section.paragraphs?.length ? (
              <div className={`${section.title ? 'mt-3' : ''} space-y-3`}>
                {section.paragraphs.map((item, itemIndex) => (
                  <p key={itemIndex} className="text-sm leading-7 text-slate-700">
                    {item.label ? <strong>{item.label} </strong> : null}
                    {item.href ? (
                      <ExternalLink
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-400 underline-offset-2"
                      >
                        {item.text}
                      </ExternalLink>
                    ) : (
                      item.text
                    )}
                  </p>
                ))}
              </div>
            ) : null}
            {section.bullets?.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
                {section.bullets.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {item.label ? <strong>{item.label} </strong> : null}
                    {item.href ? (
                      <ExternalLink
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-400 underline-offset-2"
                      >
                        {item.text}
                      </ExternalLink>
                    ) : (
                      item.text
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  )
}
