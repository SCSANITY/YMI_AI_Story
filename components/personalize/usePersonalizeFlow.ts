// components/personalize/usePersonalizeFlow.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Book, Language } from '@/types';

export type PersonalizeStep = 1 | 2 | 2.5 | 3;

const normalizeStep = (step: number | undefined): PersonalizeStep => {
  if (step === 1 || step === 2 || step === 2.5 || step === 3) {
    return step;
  }
  return 2;
};

const normalizeLanguage = (value: string | undefined): Language => {
  switch (value) {
    case 'English':
    case 'en':
      return 'en';
    case 'Chinese':
    case 'cn_s':
      return 'cn_s';
    case 'cn_t':
      return 'cn_t';
    default:
      return 'en';
  }
};

export type PersonalizeDraft = {
  bookID: string;
  step: PersonalizeStep;
  personalization: {
    childName: string;
    childAge: string;
    language: Language;
    bookType: 'digital' | 'basic' | 'premium' | 'supreme';
    dedication: string;
    photo?: File;
  };
};

export function usePersonalizeFlow(book: Book | undefined) {
  const {
    user,
    resumeData,
    addToCart,
    openLoginModal,
  } = useGlobalContext();

  const [draft, setDraft] = useState<PersonalizeDraft | null>(null);

  /** 初始化（新建 or resume） */
  useEffect(() => {
    if (!book) return;

    if (resumeData && resumeData.bookID === book.bookID) {
      setDraft({
        bookID: book.bookID,
        step: normalizeStep(resumeData.savedStep),
        personalization: {
          childName: resumeData.personalization?.childName ?? '',
          childAge: resumeData.personalization?.childAge ?? '',
          language: normalizeLanguage(resumeData.personalization?.language),
          bookType: resumeData.personalization?.bookType ?? 'basic',
          dedication: resumeData.personalization?.dedication ?? '',
        },
      });
    } else {
      setDraft({
        bookID: book.bookID,
        step: 2,
        personalization: {
          childName: '',
          childAge: '',
          language: 'en',
          bookType: 'basic',
          dedication: '',
        },
      });
    }
  }, [book, resumeData]);

  /** Step 控制 */
  const setStep = useCallback((step: PersonalizeStep) => {
    setDraft(prev => prev ? { ...prev, step } : prev);
  }, []);

  /** 更新 personalization */
  const updatePersonalization = useCallback(
    (partial: Partial<PersonalizeDraft['personalization']>) => {
      setDraft(prev =>
        prev
          ? {
              ...prev,
              personalization: {
                ...prev.personalization,
                ...partial,
              },
            }
          : prev
      );
    },
    []
  );

  /** 加入购物车（唯一出口） */
  const commitToCart = useCallback(() => {
    if (!draft || !book) return;

    if (!user) {
      openLoginModal();
      return;
    }

    addToCart(book, draft.personalization, draft.step);
  }, [draft, book, user, addToCart, openLoginModal]);

  return {
    draft,
    step: draft?.step,
    personalization: draft?.personalization,
    setStep,
    updatePersonalization,
    commitToCart,
  };
}
