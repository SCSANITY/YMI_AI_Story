'use client';

import { useState } from 'react';

export type PersonalizeStep = 1 | 2 | 2.5 | 3;

export function usePersonalizeState() {
  // --- Form States ---
  const [step, setStep] = useState<PersonalizeStep>(1);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [selectedLang, setSelectedLang] = useState('English');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // --- Book Type ---
  const [bookType, setBookType] =
    useState<'digital' | 'basic' | 'premium' | 'supreme'>('basic');

  // --- Loading State ---
  const [loadingText, setLoadingText] =
    useState('Initializing magic...');
  const [progress, setProgress] = useState(0);

  return {
    step,
    setStep,

    name,
    setName,

    age,
    setAge,

    selectedLang,
    setSelectedLang,

    photo,
    setPhoto,

    photoPreview,
    setPhotoPreview,

    bookType,
    setBookType,

    loadingText,
    setLoadingText,

    progress,
    setProgress,
  };
}
