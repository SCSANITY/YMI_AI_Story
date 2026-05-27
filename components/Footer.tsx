'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown, Facebook, Instagram, Mail, Music2, X } from 'lucide-react'
import {
  getFooterLegalContent,
  type LegalSection,
  type LegalTextItem,
} from '@/lib/footer-legal-content'
import { openCookieSettings } from '@/lib/cookie-consent'
import { useI18n } from '@/lib/useI18n'

type LegalModalType = 'privacy' | 'terms' | 'shipping' | 'refund' | 'safety' | 'impact' | 'faq' | 'ourStory' | null

type FaqItem = {
  question: string
  answer: string
  bullets?: string[]
}

type FaqSection = {
  title: string
  accentClassName: string
  items: FaqItem[]
}

export const Footer: React.FC = () => {
  const { language, t } = useI18n()
  const [openLegalModal, setOpenLegalModal] = useState<LegalModalType>(null)
  const [openFaqIndex, setOpenFaqIndex] = useState<string | null>(null)
  const [isTikTokComingSoonOpen, setIsTikTokComingSoonOpen] = useState(false)
  const [subscriberEmail, setSubscriberEmail] = useState('')
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [subscribeMessage, setSubscribeMessage] = useState('')

  const handleLegalModalChange = (nextModal: LegalModalType) => {
    if (nextModal !== 'faq') {
      setOpenFaqIndex(null)
    }
    setOpenLegalModal(nextModal)
  }

  useEffect(() => {
    if (!isTikTokComingSoonOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTikTokComingSoonOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isTikTokComingSoonOpen])

  const quickAnswers = useMemo(
    () => [
      'Illustrations are inspired by your photos, not exact replicas.',
      'Personalized products cannot be refunded once production begins.',
      'We never use your or your child\'s data to train AI.',
    ],
    []
  )

  const faqSections = useMemo<FaqSection[]>(
    () => [
      {
        title: '1. About the Product',
        accentClassName: 'bg-emerald-400',
        items: [
          {
            question: 'What is a personalized YMI book?',
            answer:
              'Each YMI book is a one-of-a-kind product created using your child\'s photos, personal details, and optional voice input. Our system generates a unique story, illustrations, and overall experience tailored specifically to your submission.',
          },
          {
            question: 'How is this different from a regular book?',
            answer:
              'Unlike traditional books, YMI books are not mass-produced. Each order is individually generated and produced based on your input, making every book unique.',
          },
          {
            question: 'Will the character look exactly like my child?',
            answer:
              'Not exactly. Illustrations are inspired by your photos, rather than exact replicas. This artistic interpretation is part of the creative storytelling process.',
          },
          {
            question: 'Why does the result sometimes look different from what I expected?',
            answer:
              'YMI uses AI to generate visuals and story elements. Results may vary depending on your uploaded materials, including photo quality, lighting, and composition.',
          },
          {
            question: 'Can I preview the book before ordering?',
            answer:
              'We provide sample previews and references, but the final product is generated after your order is placed and may differ slightly.',
          },
        ],
      },
      {
        title: '2. Photos, Voice & Personalization',
        accentClassName: 'bg-yellow-400',
        items: [
          {
            question: 'What type of photos should I upload?',
            answer: 'For best results, upload clear and well-lit photos. Front-facing photos generally work best, and higher-quality inputs lead to better results.',
            bullets: ['Use clear, well-lit photos.', 'Avoid blurry or low-resolution images.', 'Choose photos where the face is easy to see.'],
          },
          {
            question: 'How many photos can I upload?',
            answer: 'You can upload multiple photos. We generally recommend 1-5 photos to improve personalization quality.',
          },
          {
            question: 'What happens if I upload poor-quality photos?',
            answer:
              'Low-quality images may affect the final result. This is not considered a defect, because the output depends on the input provided.',
          },
          {
            question: 'How does the voice feature work?',
            answer:
              'You may upload a short audio sample to personalize the voice experience. The generated voice reflects tone and style, but is not an exact replica.',
          },
          {
            question: 'Can I upload any voice recording?',
            answer:
              'You should only upload recordings that you have the right to use. You must not upload audio intended to impersonate another individual without their consent.',
          },
          {
            question: 'Can I use photos or voices of other people?',
            answer:
              'Only if you have proper authorization. By uploading any content, you confirm that you have the legal right to use it.',
          },
        ],
      },
      {
        title: '3. Orders, Changes & Production',
        accentClassName: 'bg-orange-400',
        items: [
          {
            question: 'What happens after I place an order?',
            answer: 'Your order enters a production process that includes AI generation, content preparation, printing, packaging, and shipping.',
            bullets: ['AI generation for story, images, and voice if applicable.', 'Content preparation.', 'Printing and production.', 'Packaging and shipping.'],
          },
          {
            question: 'Can I change my order after placing it?',
            answer:
              'Changes are not guaranteed once production begins. Production typically starts shortly after checkout, so please review all details carefully before ordering.',
          },
          {
            question: 'Can I cancel my order?',
            answer: 'Orders cannot be canceled once they have entered production.',
          },
          {
            question: 'How long does production take?',
            answer: 'Production typically takes 5-10 business days, depending on workload and order complexity.',
          },
        ],
      },
      {
        title: '4. Shipping & Delivery',
        accentClassName: 'bg-sky-400',
        items: [
          {
            question: 'Do you ship internationally?',
            answer: 'Yes, we ship worldwide.',
          },
          {
            question: 'How long does delivery take?',
            answer: 'Total delivery time consists of processing time plus shipping time. Processing usually takes 5-10 business days, and shipping varies by location.',
            bullets: ['Hong Kong / Mainland China: 3-5 business days.', 'USA / Canada: 5-10 business days.', 'Europe: 5-12 business days.', 'Other Asia: 5-12 business days.'],
          },
          {
            question: 'Will I receive tracking information?',
            answer: 'Yes. Once your order is shipped, a tracking number will be provided via email.',
          },
          {
            question: 'Why is my order delayed?',
            answer:
              'Delays may occur due to customs clearance, courier delays, weather, or logistics issues. These factors are outside our control.',
          },
          {
            question: 'Do I need to pay customs or import fees?',
            answer:
              'Depending on your country, duties and taxes may apply. These charges are the responsibility of the recipient.',
          },
          {
            question: 'What if I entered the wrong shipping address?',
            answer:
              'Customers are responsible for ensuring address accuracy. We are not responsible for losses caused by incorrect or incomplete addresses.',
          },
        ],
      },
      {
        title: '5. Refunds, Returns & Issues',
        accentClassName: 'bg-rose-400',
        items: [
          {
            question: 'Can I request a refund?',
            answer:
              'Because each product is personalized, refunds are generally not available once production begins.',
          },
          {
            question: 'What situations are eligible for replacement or refund?',
            answer: 'We may offer a replacement or resolution in limited cases.',
            bullets: ['Defective product.', 'Incorrect personalization caused by our error.', 'Damage during shipping.'],
          },
          {
            question: 'What is NOT considered a defect?',
            answer: 'The following are not considered defects.',
            bullets: ['Artistic differences in AI-generated content.', 'Minor variations in appearance or style.', 'Dissatisfaction based on personal preference.', 'Issues caused by low-quality input materials.'],
          },
          {
            question: 'How do I report a problem?',
            answer: 'Please contact us within 7 days of delivery, including photos or evidence of the issue.',
          },
        ],
      },
      {
        title: '6. AI & Technology',
        accentClassName: 'bg-violet-400',
        items: [
          {
            question: 'How does YMI use AI?',
            answer: 'We use AI to generate personalized stories, illustrations, and optional voice features.',
          },
          {
            question: 'Are the results always the same?',
            answer: 'No. AI-generated outputs may vary slightly between orders or over time.',
          },
          {
            question: 'Will the results improve if I upload better inputs?',
            answer: 'Yes. Better-quality photos and audio significantly improve results.',
          },
          {
            question: 'Do you use my data to train AI?',
            answer:
              'No. Your photos, voice recordings, and personal data are used only to create your personalized product. We do not use your or your child\'s data to train AI models, and your content is never reused for other users.',
          },
        ],
      },
      {
        title: '7. Privacy & Data Protection',
        accentClassName: 'bg-slate-500',
        items: [
          {
            question: 'How is my data used?',
            answer: 'Your data is used only to create and deliver your personalized product.',
          },
          {
            question: 'Do you use my data to train AI models?',
            answer: 'No. We do not use your or your child\'s data to train AI systems.',
          },
          {
            question: 'How long do you keep my data?',
            answer:
              'Uploaded materials are typically deleted within 60 days after order completion, unless required for legal or operational reasons.',
          },
          {
            question: 'Is my data secure?',
            answer: 'We apply reasonable technical and organizational safeguards to protect your data.',
          },
        ],
      },
      {
        title: '8. Children & Safety',
        accentClassName: 'bg-amber-700',
        items: [
          {
            question: 'Is this service suitable for children?',
            answer: 'Yes. Our products are designed for families and children.',
          },
          {
            question: 'Can children use the service directly?',
            answer: 'No. Orders must be placed by a parent or legal guardian.',
          },
          {
            question: 'What responsibility do parents have?',
            answer: 'By using our service, you confirm that you are the parent or guardian and have the right to upload the provided materials.',
          },
        ],
      },
      {
        title: '9. Legal & Usage',
        accentClassName: 'bg-gray-500',
        items: [
          {
            question: 'Who owns the uploaded content?',
            answer:
              'You retain ownership of your uploaded materials. You grant YMI a limited license to use them solely for fulfilling your order.',
          },
          {
            question: 'Can I use the generated content commercially?',
            answer: 'No. Generated content is for personal use only unless otherwise agreed.',
          },
          {
            question: 'What happens if I misuse the service?',
            answer: 'We reserve the right to reject or suspend service if content violates laws, rights, or safety standards.',
          },
        ],
      },
      {
        title: '10. Support',
        accentClassName: 'bg-pink-200',
        items: [
          {
            question: 'How can I contact you?',
            answer: 'If you have any questions or concerns, please contact us at admin@ymistory.com.',
          },
        ],
      },
    ],
    []
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
  const isShipping = openLegalModal === 'shipping'
  const isRefund = openLegalModal === 'refund'
  const isSafety = openLegalModal === 'safety'
  const isImpact = openLegalModal === 'impact'
  const modalTitle = isFaq
    ? t('footer.legalTitleFaq')
    : isPrivacy
      ? t('footer.legalTitlePrivacy')
      : isOurStory
        ? t('footer.legalTitleOurStory')
        : isShipping
          ? t('footer.legalTitleShipping')
          : isRefund
            ? t('footer.legalTitleRefund')
            : isSafety
              ? t('footer.legalTitleSafety')
              : isImpact
                ? t('footer.legalTitleImpact')
            : t('footer.legalTitleTerms')
  const modalEffectiveDate = isShipping || isRefund || isSafety ? 'May 11, 2026' : 'March 12, 2026'

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

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = subscriberEmail.trim()
    if (!email) {
      setSubscribeStatus('error')
      setSubscribeMessage(t('footer.subscribeInvalid'))
      return
    }

    setSubscribeStatus('submitting')
    setSubscribeMessage('')

    try {
      const response = await fetch('/api/newsletter-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || t('footer.subscribeError'))
      }
      setSubscriberEmail('')
      setSubscribeStatus('success')
      setSubscribeMessage(t('footer.subscribeSuccess'))
    } catch (error) {
      setSubscribeStatus('error')
      setSubscribeMessage(error instanceof Error ? error.message : t('footer.subscribeError'))
    }
  }

  return (
    <>
      <footer className="mt-0 border-t border-amber-100/60 bg-[rgba(255,250,244,1)]">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-16">
            <div className="space-y-5">
              <div className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="YMI Story"
                  width={1017}
                  height={673}
                  className="h-10 w-auto"
                />
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {t('footer.aboutDescription')}
              </p>
              <div className="flex items-center gap-3 text-amber-500">
                <a
                  className="rounded-full bg-amber-50 p-2 transition hover:bg-amber-100 hover:text-amber-600"
                  href="https://www.facebook.com/profile.php?id=61587283844755&locale=zh_CN"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                >
                  <Facebook className="h-4 w-4" />
                </a>
                <a
                  className="rounded-full bg-amber-50 p-2 transition hover:bg-amber-100 hover:text-amber-600"
                  href="https://www.instagram.com/ymi.story/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  className="rounded-full bg-amber-50 p-2 transition hover:bg-amber-100 hover:text-amber-600"
                  onClick={() => setIsTikTokComingSoonOpen(true)}
                  aria-label="TikTok"
                >
                  <Music2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{t('footer.aboutTitle')}</h3>
              <ul className="space-y-2 text-gray-600">
                <li>
                  <Link href="/support" className="hover:text-amber-600">
                    {t('footer.contactUs')}
                  </Link>
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
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('impact')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.impactProgram')}
                  </button>
                </li>
                <li>
                  <Link href="/books" className="hover:text-amber-600">
                    {t('navbar.books')}
                  </Link>
                </li>
                <li>
                  <Link href="/community" className="hover:text-amber-600">
                    {t('footer.blog')}
                  </Link>
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
                    onClick={() => handleLegalModalChange('shipping')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.shippingPolicy')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('refund')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.refundPolicy')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleLegalModalChange('safety')}
                    className="hover:text-amber-600"
                  >
                    {t('footer.safetyNotice')}
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
                <li>
                  <button
                    type="button"
                    onClick={openCookieSettings}
                    className="hover:text-amber-600"
                  >
                    {t('footer.cookieSettings')}
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-4 text-sm">
              <h3 className="text-base font-semibold text-gray-900">{t('footer.subscribeTitle')}</h3>
              <p className="text-gray-600">{t('footer.subscribeDescription')}</p>
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={subscriberEmail}
                    onChange={(event) => {
                      setSubscriberEmail(event.target.value)
                      if (subscribeStatus !== 'submitting') {
                        setSubscribeStatus('idle')
                        setSubscribeMessage('')
                      }
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
                    placeholder={t('footer.emailPlaceholder')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={subscribeStatus === 'submitting'}
                  className="h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {subscribeStatus === 'submitting' ? t('footer.subscribing') : t('footer.subscribe')}
                </button>
                {subscribeMessage ? (
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-5 ${
                      subscribeStatus === 'success'
                        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                        : 'border-rose-100 bg-rose-50 text-rose-600'
                    }`}
                  >
                    {subscribeMessage}
                  </div>
                ) : null}
              </form>
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
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-amber-100/60">
          <div className="container mx-auto flex flex-col items-center justify-center gap-2 px-4 py-4 text-sm text-gray-400 sm:flex-row">
            <span>{t('footer.copyright')}</span>
          </div>
        </div>
      </footer>

      {isTikTokComingSoonOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[3px]"
            onClick={() => setIsTikTokComingSoonOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tiktok-coming-soon-title"
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-[28px] border border-white/60 bg-white/72 p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-3xl backdrop-saturate-[180%]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-transparent to-amber-50/35"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 left-1/2 h-36 w-52 -translate-x-1/2 rounded-full bg-amber-200/50 blur-3xl"
            />

            <button
              type="button"
              onClick={() => setIsTikTokComingSoonOpen(false)}
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/65 bg-white/52 text-slate-400 transition hover:bg-white/80 hover:text-slate-600"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/75 bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 shadow-[0_12px_28px_rgba(251,146,60,0.18)]">
              <Music2 className="h-6 w-6" />
            </div>
            <h2 id="tiktok-coming-soon-title" className="relative z-10 mt-4 text-xl font-bold text-slate-900">
              TikTok Coming Soon
            </h2>
            <p className="relative z-10 mt-2 text-sm leading-6 text-slate-500">
              Our TikTok channel is being prepared. Follow us on Facebook or Instagram for now.
            </p>
            <button
              type="button"
              onClick={() => setIsTikTokComingSoonOpen(false)}
              className="relative z-10 mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(251,146,60,0.30)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(251,146,60,0.38)]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

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
                  {t('footer.effectiveDate', { date: modalEffectiveDate })}
                </p>
              )}
            </div>

            <div className="relative z-10">
              <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-gray-700 [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] sm:px-8">
                {isFaq ? (
                  <section className="space-y-5">
                    <div className="rounded-2xl border border-amber-100/80 bg-amber-50/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Quick Answers</h3>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        {quickAnswers.map((answer) => (
                          <li key={answer} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                            <span>{answer}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {faqSections.map((section, sectionIndex) => (
                      <div key={section.title} className="space-y-3">
                        <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                          <span className={`h-2.5 w-2.5 rounded-full ${section.accentClassName}`} />
                          {section.title}
                        </h3>
                        <div className="space-y-3">
                          {section.items.map((item, itemIndex) => {
                            const itemKey = `${sectionIndex}-${itemIndex}`
                            const isOpen = openFaqIndex === itemKey
                            return (
                              <div
                                key={item.question}
                                className="overflow-hidden rounded-2xl border border-black/8 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-md"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenFaqIndex(isOpen ? null : itemKey)}
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
                                  <div className="space-y-3 border-t border-black/6 px-4 py-4 text-sm leading-relaxed text-gray-700">
                                    <p>{item.answer}</p>
                                    {item.bullets ? (
                                      <ul className="list-disc space-y-1 pl-5">
                                        {item.bullets.map((bullet) => (
                                          <li key={bullet}>{bullet}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                ) : isPrivacy ? (
                  renderLegalSections(legalContent.privacy)
                ) : isOurStory ? (
                  renderLegalSections(legalContent.ourStory)
                ) : isShipping ? (
                  renderLegalSections(legalContent.shipping)
                ) : isRefund ? (
                  renderLegalSections(legalContent.refund)
                ) : isSafety ? (
                  renderLegalSections(legalContent.safety)
                ) : isImpact ? (
                  renderLegalSections(legalContent.impact)
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
