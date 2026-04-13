// components/personalize/usePersonalizeFlow.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Book, StoryLanguage } from '@/types';
import { isUuid } from '@/lib/validators';

export type PersonalizeStep = 1 | 2 | 2.5 | 3;

const normalizeStep = (step: number | undefined): PersonalizeStep => {
  if (step === 1 || step === 2 || step === 2.5 || step === 3) {
    return step;
  }
  return 2;
};

const normalizeLanguage = (value: string | undefined): StoryLanguage => {
  switch (value) {
    case 'English':
      return 'English';
    case 'Traditional Chinese':
    case 'Chinese':
    case 'cn_t':
    case 'zh-hk':
    case 'traditional':
      return 'Traditional Chinese';
    case 'Spanish':
    case 'es':
      return 'Spanish';
    default:
      return 'English';
  }
};

export type PersonalizeDraft = {
  bookID: string;
  step: PersonalizeStep;
  personalization: {
    childName: string;
    childAge: string;
    language: StoryLanguage;
    bookType: 'digital' | 'basic' | 'premium' | 'supreme';
    dedication: string;
    photo?: File;
    assetId?: string;
    storagePath?: string;
    faceImageUrl?: string;
    voiceAssetId?: string;
    voiceStoragePath?: string;
    previewJobId?: string;
    creationId?: string;
  };
};

export function usePersonalizeFlow(book: Book | undefined) {
  const {
    resumeData,
    addToCart,
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
          assetId: resumeData.personalization?.assetId,
          storagePath: resumeData.personalization?.storagePath,
          faceImageUrl: resumeData.personalization?.faceImageUrl,
          voiceAssetId: resumeData.personalization?.voiceAssetId,
          voiceStoragePath: resumeData.personalization?.voiceStoragePath,
          previewJobId: isUuid(resumeData.personalization?.previewJobId)
            ? resumeData.personalization?.previewJobId
            : undefined,
          creationId: resumeData.personalization?.creationId,
        },
      });
    } else {
      setDraft({
        bookID: book.bookID,
        step: 2,
        personalization: {
          childName: '',
          childAge: '',
          language: 'English',
          bookType: 'basic',
          dedication: '',
          assetId: undefined,
          storagePath: undefined,
          faceImageUrl: undefined,
          voiceAssetId: undefined,
          voiceStoragePath: undefined,
          previewJobId: undefined,
          creationId: undefined,
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
  const commitToCart = useCallback(async () => {
    if (!draft || !book) return;

    await addToCart(book, draft.personalization, draft.step);
  }, [draft, book, addToCart]);

  return {
    draft,
    step: draft?.step,
    personalization: draft?.personalization,
    setStep,
    updatePersonalization,
    commitToCart,
  };
}
