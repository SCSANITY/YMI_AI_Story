'use client';

import React, { useState } from 'react';
import { CheckCircle2, Headphones, LockKeyhole, Send } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';

export default function SupportPage() {
  const { t } = useI18n();
  const { user, openLoginModal } = useGlobalContext();
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setStatus('error');
      setMessage(t('support.questionRequired'));
      return;
    }

    setIsSubmitting(true);
    setStatus('idle');
    setMessage('');

    try {
      const response = await fetch('/api/support/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: normalizedQuestion }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || t('support.submitError'));
      }
      setQuestion('');
      setStatus('success');
      setMessage(t('support.submitSuccess'));
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : t('support.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-surface min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <Headphones className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="font-title text-2xl text-gray-900 md:text-3xl">{t('support.title')}</h1>
            <p className="text-sm text-gray-500">{t('support.subtitle')}</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/78 p-5 shadow-[0_24px_70px_rgba(146,64,14,0.10)] backdrop-blur-xl md:p-8">
            {user ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                    <Send className="h-3.5 w-3.5" />
                    {t('support.formBadge')}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-950">{t('support.formTitle')}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {t('support.formDescription')}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/45 p-3 text-sm text-gray-600">
                  {t('support.signedInAs', { email: user.email })}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-700">{t('support.questionLabel')}</span>
                  <textarea
                    value={question}
                    onChange={(event) => {
                      setQuestion(event.target.value);
                      if (status !== 'idle') {
                        setStatus('idle');
                        setMessage('');
                      }
                    }}
                    maxLength={4000}
                    placeholder={t('support.questionPlaceholder')}
                    className="min-h-52 w-full resize-none rounded-2xl border border-amber-100 bg-white/90 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500">{t('support.replyHint')}</p>
                  <Button type="submit" disabled={isSubmitting} className="gap-2 rounded-full px-6">
                    <Send className="h-4 w-4" />
                    {isSubmitting ? t('support.submitting') : t('support.submit')}
                  </Button>
                </div>

                {message ? (
                  <div
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${
                      status === 'success'
                        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                        : 'border-rose-100 bg-rose-50 text-rose-600'
                    }`}
                  >
                    {status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    <span>{message}</span>
                  </div>
                ) : null}
              </form>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-700">
                  <LockKeyhole className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-bold text-gray-950">{t('support.loginRequiredTitle')}</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-gray-600">
                  {t('support.loginRequiredDescription')}
                </p>
                <Button onClick={() => openLoginModal('login')} className="mt-6 rounded-full px-6">
                  {t('navbar.logIn')}
                </Button>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_18px_48px_rgba(146,64,14,0.08)] backdrop-blur-xl">
              <h2 className="text-lg font-bold text-gray-950">{t('support.sideTitle')}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{t('support.sideDescription')}</p>
            </div>
            <div className="rounded-[28px] border border-amber-100 bg-amber-50/55 p-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-amber-700">
                {t('support.emailNoticeTitle')}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{t('support.emailNotice')}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
