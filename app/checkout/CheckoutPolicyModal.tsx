'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { LegalSection, LegalTextItem } from '@/lib/footer-legal-content';

type CheckoutPolicyModalProps = {
  title: string;
  sections: LegalSection[];
  effectiveDate: string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onClose: () => void;
};

const renderPolicyTextItem = (item: LegalTextItem, key: string, className = '') => (
  <p key={key} className={className}>
    {item.label ? <span className="font-semibold">{item.label}</span> : null}
    {item.label ? ' ' : null}
    {item.text}
  </p>
);

const renderPolicySections = (sections: LegalSection[]) =>
  sections.map((section, sectionIndex) => (
    <section key={`${section.title || 'section'}-${sectionIndex}`}>
      {section.title ? (
        <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3>
      ) : null}
      {section.paragraphs?.map((item, paragraphIndex) =>
        renderPolicyTextItem(
          item,
          `p-${sectionIndex}-${paragraphIndex}`,
          paragraphIndex < (section.paragraphs?.length ?? 0) - 1 ? 'mb-2' : ''
        )
      )}
      {section.bullets ? (
        <ul className="list-disc space-y-1 pl-5">
          {section.bullets.map((item, bulletIndex) => (
            <li key={`b-${sectionIndex}-${bulletIndex}`}>
              {item.label ? <span className="font-semibold">{item.label}</span> : null}
              {item.label ? ' ' : null}
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  ));

export function CheckoutPolicyModal({
  title,
  sections,
  effectiveDate,
  t,
  onClose,
}: CheckoutPolicyModalProps) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/35 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/40 bg-white/40 shadow-[0_40px_100px_rgba(0,0,0,0.18),0_12px_32px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-3xl backdrop-saturate-[200%]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-b from-white/40 via-transparent to-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 left-1/3 h-36 w-64 rounded-full bg-amber-200/40 blur-3xl"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-black/8 text-gray-500 transition-all duration-150 hover:bg-black/12 hover:text-gray-800"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative z-10 border-b border-black/8 px-6 py-5 sm:px-8">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {t('footer.effectiveDate', { date: effectiveDate })}
          </p>
        </div>
        <div className="relative z-10">
          <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-gray-700 [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] sm:px-8">
            {renderPolicySections(sections)}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white/60 to-transparent"
          />
        </div>
        <div className="relative z-10 flex justify-end border-t border-black/8 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full border border-black/10 bg-black/6 px-5 text-sm font-semibold text-gray-700 transition-all duration-150 hover:bg-black/10 hover:text-gray-900"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
