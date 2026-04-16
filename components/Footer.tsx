'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Facebook, Instagram, Mail, Music2, Phone, X } from 'lucide-react'
import {
  getFooterLegalContent,
  type LegalSection,
  type LegalTextItem,
} from '@/lib/footer-legal-content'
import { useI18n } from '@/lib/useI18n'

type LegalModalType = 'privacy' | 'terms' | 'faq' | 'ourStory' | null

type FaqItem = {
  question: string
  answer: string
}

export const Footer: React.FC = () => {
  const { language, t } = useI18n()
  const [openLegalModal, setOpenLegalModal] = useState<LegalModalType>(null)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const handleLegalModalChange = (nextModal: LegalModalType) => {
    if (nextModal !== 'faq') {
      setOpenFaqIndex(null)
    }
    setOpenLegalModal(nextModal)
  }

  const faqItems = useMemo<FaqItem[]>(
    () => [
      { question: t('footer.faqQ1'), answer: t('footer.faqA1') },
      { question: t('footer.faqQ2'), answer: t('footer.faqA2') },
      { question: t('footer.faqQ3'), answer: t('footer.faqA3') },
      { question: t('footer.faqQ4'), answer: t('footer.faqA4') },
      { question: t('footer.faqQ5'), answer: t('footer.faqA5') },
      { question: t('footer.faqQ6'), answer: t('footer.faqA6') },
      { question: t('footer.faqQ7'), answer: t('footer.faqA7') },
      { question: t('footer.faqQ8'), answer: t('footer.faqA8') },
      { question: t('footer.faqQ9'), answer: t('footer.faqA9') },
      { question: t('footer.faqQ10'), answer: t('footer.faqA10') },
    ],
    [t]
  )

  const legalContent = useMemo(() => getFooterLegalContent(language), [language])

  useEffect(() => {
    if (!openLegalModal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [openLegalModal])

  const isPrivacy = openLegalModal === 'privacy'
  const isFaq = openLegalModal === 'faq'
  const isOurStory = openLegalModal === 'ourStory'
  const modalTitle = isFaq
    ? t('footer.legalTitleFaq')
    : isPrivacy
      ? t('footer.legalTitlePrivacy')
      : isOurStory
        ? t('footer.legalTitleOurStory')
      : t('footer.legalTitleTerms')

  const renderTextItem = (item: LegalTextItem, key: string, className = '') => (
    <p key={key} className={className}>
      {item.label ? <span className="font-semibold">{item.label}</span> : null}
      {item.label ? ' ' : null}
      {item.text}
    </p>
  )

  const renderLegalSections = (sections: LegalSection[]) =>
    sections.map((section, sectionIndex) => (
      <section key={`${section.title || 'section'}-${sectionIndex}`}>
        {section.title ? (
          <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3>
        ) : null}
        {section.paragraphs?.map((item, paragraphIndex) =>
          renderTextItem(
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
    ))

  return (
    <>
      <footer className="mt-0 border-t border-amber-100/60 bg-[rgba(255,250,244,1)]">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-16">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 font-black text-white">
                  Y
                </div>
                <div className="text-lg font-bold text-gray-900">YMI Books</div>
              </div>
              <p className="text-sm leading-relaxed text-gray-600">{t('footer.aboutDescription')}</p>
              <div className="flex items-center gap-3 text-amber-500">
                <a className="rounded-full bg-amber-50 p-2 hover:bg-amber-100" href="#" aria-label="Facebook">
                  <Facebook className="h-4 w-4" />
                </a>
                <a className="rounded-full bg-amber-50 p-2 hover:bg-amber-100" href="#" aria-label="Instagram">
                  <Instagram className="h-4 w-4" />
                </a>
                <a className="rounded-full bg-amber-50 p-2 hover:bg-amber-100" href="#" aria-label="TikTok">
                  <Music2 className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{t('footer.aboutTitle')}</h3>
              <ul className="space-y-2 text-gray-600">
                <li>
                  <a href="#" className="hover:text-amber-600">
                    {t('footer.contactUs')}
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('faq')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.faq')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('ourStory')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.ourStory')}
                  </button>
                </li>
                <li>
                  <a href="#books" className="hover:text-amber-600">
                    {t('navbar.books')}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-amber-600">
                    {t('footer.blog')}
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-4 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{t('footer.customerArea')}</h3>
              <ul className="space-y-2 text-gray-600">
                <li>
                  <Link href="/favorites" className="hover:text-amber-600">
                    {t('footer.myAccount')}
                  </Link>
                </li>
                <li>
                  <Link href="/orders" className="hover:text-amber-600">
                    {t('footer.orders')}
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('terms')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.terms')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('privacy')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.privacy')}
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-4 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{t('footer.subscribeTitle')}</h3>
              <p className="text-gray-600">{t('footer.subscribeDescription')}</p>
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
                    placeholder={t('footer.emailPlaceholder')}
                  />
                </div>
                <button className="h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-white">
                  {t('footer.subscribe')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 text-gray-400">
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs">AMEX</span>
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs">Klarna</span>
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs">PayPal</span>
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs">Visa</span>
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs">Mastercard</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> admin@ymistory.com
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> +1 (555) 201-2026
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-amber-100/60">
          <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 py-4 text-sm text-gray-400 sm:flex-row">
            <span>{t('footer.copyright')}</span>
            <span>{t('footer.demo')}</span>
          </div>
        </div>
      </footer>

      {openLegalModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/35 backdrop-blur-[3px]"
            onClick={() => handleLegalModalChange(null)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
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
              onClick={() => handleLegalModalChange(null)}
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-black/8 text-gray-500 transition-all duration-150 hover:bg-black/12 hover:text-gray-800"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative z-10 border-b border-black/8 px-6 py-5 sm:px-8">
              <h2 className="text-2xl font-bold text-gray-900">{modalTitle}</h2>
              {isOurStory ? null : (
                <p className="mt-0.5 text-sm text-gray-500">
                  {t('footer.effectiveDate', { date: 'March 12, 2026' })}
                </p>
              )}
            </div>

            <div className="relative z-10">
              <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-gray-700 [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] sm:px-8">
                {isFaq ? (
                  <section className="space-y-3">
                    <p className="text-sm text-gray-600">{t('footer.faqIntro')}</p>
                    <div className="space-y-3">
                      {faqItems.map((item, index) => {
                        const isOpen = openFaqIndex === index
                        return (
                          <div
                            key={item.question}
                            className="overflow-hidden rounded-2xl border border-black/8 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-md"
                          >
                            <button
                              type="button"
                              onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                              aria-expanded={isOpen}
                            >
                              <span className="text-sm font-semibold text-gray-900">{item.question}</span>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 ${
                                  isOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {isOpen ? (
                              <div className="border-t border-black/6 px-4 py-4 text-sm leading-relaxed text-gray-700">
                                {item.answer}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ) : isPrivacy ? (
                  renderLegalSections(legalContent.privacy)
                ) : isOurStory ? (
                  renderLegalSections(legalContent.ourStory)
                ) : (
                  renderLegalSections(legalContent.terms)
                )}
              </div>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white/60 to-transparent"
              />
            </div>

            <div className="relative z-10 flex justify-end border-t border-black/8 px-6 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => handleLegalModalChange(null)}
                className="h-9 rounded-full border border-black/10 bg-black/6 px-5 text-sm font-semibold text-gray-700 transition-all duration-150 hover:bg-black/10 hover:text-gray-900"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
