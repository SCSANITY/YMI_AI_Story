'use client'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { ChevronLeft, ChevronRight, ChevronDown, Camera, Lock, Sparkles, Heart, Shield, Wand2, ShoppingCart, LogOut, Package, BookOpen, Star, Info, Check, Book, X, Share2, CircleHelp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersonalizeFlow } from '@/components/personalize/usePersonalizeFlow';
import { usePersonalizeState } from '@/components/personalize/usePersonalizeState';
import { uploadUserAsset } from '@/services/assets';
import { cancelPreviewJob, createPreviewJob, getJob, getPreviewPages, getPreviewUrl } from '@/services/jobs';
import { supabase } from '@/lib/supabase';
import { usePersonalizeStage } from '@/components/personalize/usePersonalizeStage';
import { isUuid } from '@/lib/validators';
import { useI18n } from '@/lib/useI18n';
import { formatLocaleCurrency } from '@/lib/locale-pricing';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ShareDialog } from '@/components/ShareDialog';
import { MiniGame } from '@/components/MiniGame';
import { VoiceRecorderPanel } from '@/components/personalize/VoiceRecorderPanel';
import { useBookCatalog } from '@/components/useBookCatalog';
import type { StoryLanguage } from '@/types';

const normalizeStoryLanguage = (value: unknown): StoryLanguage => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese';
  }
  if (raw === 'spanish' || raw === 'es') {
    return 'Spanish';
  }
  return 'English';
};

const GOOD_PHOTO_EXAMPLES = [
  { src: '/personalize-photo-samples/optimized/good-01.webp', alt: 'Good photo example 1' },
  { src: '/personalize-photo-samples/optimized/good-02.webp', alt: 'Good photo example 2' },
  { src: '/personalize-photo-samples/optimized/good-03.webp', alt: 'Good photo example 3' },
];

const BAD_PHOTO_EXAMPLES = [
  { src: '/personalize-photo-samples/optimized/bad-01.webp', alt: 'Bad photo example 1' },
  { src: '/personalize-photo-samples/optimized/bad-02.webp', alt: 'Bad photo example 2' },
  { src: '/personalize-photo-samples/optimized/bad-03.webp', alt: 'Bad photo example 3' },
];

export default function PersonalizePage({ bookID }: { bookID: string }) {

  const fsm = usePersonalizeStage()
  const { t } = useI18n()

  const { user, openLoginModal, logout, addToCart, prepareCheckout, resumeData, resumePersonalization, language, cart} = useGlobalContext();
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const { books: catalogBooks, isLoading: isBookCatalogLoading } = useBookCatalog();
  const book = catalogBooks.find(b => b.bookID === bookID);
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewMode = searchParams?.get('view') || 'edit';
  const creationIdParam = searchParams?.get('creationId') || null;
  const previewJobIdParam = searchParams?.get('jobId') || null;
  const { step: flowStep } = usePersonalizeFlow(book);

  const {
    name, setName,
    age, setAge,
    selectedLang, setSelectedLang,
    photo, setPhoto,
    photoPreview, setPhotoPreview,
    photoAssetId, setPhotoAssetId,
    photoStoragePath, setPhotoStoragePath,
    faceImageUrl, setFaceImageUrl,
    bookType, setBookType,
    loadingText, setLoadingText,
    progress, setProgress,
    } = usePersonalizeState();



  const {
    stage,
    finishGenerating,
    reset,
    isExiting,
    viewState,
    uiProgress,
    } = fsm;

  //?函蕃Steps
  const PROGRESS_MAP = {
    STORY: 0,
    CUSTOMIZE: 1,
    PREVIEW: 2,
  } as const

  const currentProgressIndex = PROGRESS_MAP[uiProgress]


  // --- Header Menu States ---
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  
 

  // --- Animation States ---
  const [showFlyAnimation, setShowFlyAnimation] = useState(false);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null); 
  const [flyOrigin, setFlyOrigin] = useState({ x: 0, y: 0 });
  const [flyTarget, setFlyTarget] = useState({ x: 0, y: 0 });
  const shouldAnimateToCartRef = useRef(false);
  const exitRunningRef = useRef(false);
  const [showPreviewCancelledToast, setShowPreviewCancelledToast] = useState(false);
  const previewCancelToastTimerRef = useRef<number | null>(null);
  const previewCancelRequestedRef = useRef(false);
  const [loadingCountdownSeconds, setLoadingCountdownSeconds] = useState(40);



  // --- Flipbook Engine State ---
  const TOTAL_SPREADS = 15;
  const PAGE_WIDTH = 380; 
  const PAGE_HEIGHT = 380; // Square page for preview model
  const PREVIEW_HEIGHT = PAGE_HEIGHT + 40;
  const ANIMATION_DURATION = 0.8; 
  
  const [currentSpread, setCurrentSpread] = useState(0); 
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [voiceAssetId, setVoiceAssetId] = useState<string | null>(null);
  const [voiceStoragePath, setVoiceStoragePath] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [creationId, setCreationId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [previewShareUrl, setPreviewShareUrl] = useState<string | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isCheckoutAcknowledged, setIsCheckoutAcknowledged] = useState(false);
  const [checkoutAcknowledgementError, setCheckoutAcknowledgementError] = useState(false);
  const generationInFlightRef = useRef(false);
  const checkoutInFlightRef = useRef(false);
  const [templateCoverUrl, setTemplateCoverUrl] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateDescription, setTemplateDescription] = useState<string | null>(null);
  const [recentFaces, setRecentFaces] = useState<Array<{ asset_id: string; storage_path?: string | null; signed_url?: string }>>([]);
  const [recentVoices, setRecentVoices] = useState<Array<{ asset_id: string; storage_path?: string | null; signed_url?: string | null; metadata?: { duration_seconds?: number | null } }>>([]);
  const [voiceSignedUrl, setVoiceSignedUrl] = useState<string | null>(null);
  const [voiceValidationError, setVoiceValidationError] = useState<string | null>(null);
  type RecentProfileItem = {
    asset_id: string
    metadata?: { child_name?: string; child_age?: number; name?: string; age?: number; gender?: string }
  }

  const handleOpenPreviewShare = useCallback(async () => {
    if (!creationId) {
      setShareError(t('share.previewUnavailable'));
      return;
    }

    setIsPreparingShare(true);
    setShareError(null);

    try {
      const response = await fetch('/api/share/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          creationId,
          customerId: user?.customerId ?? null,
        }),
      });
      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.shareUrl) {
        setShareError(data?.error || t('share.previewCreateFailed'));
        return;
      }
      setPreviewShareUrl(data.shareUrl);
      setIsShareDialogOpen(true);
    } catch {
      setShareError(t('share.previewCreateFailed'));
    } finally {
      setIsPreparingShare(false);
    }
  }, [creationId, t, user?.customerId]);
  const [recentProfiles, setRecentProfiles] = useState<RecentProfileItem[]>([]);
  const [showNameHistory, setShowNameHistory] = useState(false);
  const [showAgeHistory, setShowAgeHistory] = useState(false);
  const [showLanguageOptions, setShowLanguageOptions] = useState(false);
  const [expandedBookFaq, setExpandedBookFaq] = useState<number | null>(0);
  const [isMobileStoryInfoOpen, setMobileStoryInfoOpen] = useState(false);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
  const [desktopShowcaseThumbSize, setDesktopShowcaseThumbSize] = useState(72);
  const [desktopMainShowcaseSize, setDesktopMainShowcaseSize] = useState(520);
  const [desktopThumbColumnWidth, setDesktopThumbColumnWidth] = useState(78);
  const nameBoxRef = useRef<HTMLDivElement | null>(null);
  const ageBoxRef = useRef<HTMLDivElement | null>(null);
  const languageBoxRef = useRef<HTMLDivElement | null>(null);
  const voicePanelRef = useRef<HTMLDivElement | null>(null);
  const mainShowcaseRef = useRef<HTMLDivElement | null>(null);
  const showcaseThumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const showcaseRowRef = useRef<HTMLDivElement | null>(null);
  const showcaseThumbViewportRef = useRef<HTMLDivElement | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);
  // --- Mobile Responsive State ---
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const resolvedBook = useMemo(() => {
    if (!book) return null;
    return {
      ...book,
      title: templateTitle ?? book.title,
      coverUrl: templateCoverUrl ?? book.coverUrl,
      description: templateDescription ?? book.description,
    };
  }, [book, templateTitle, templateCoverUrl, templateDescription]);

  // --- Calculations ---
  const currentPrice = book
    ? bookType === 'premium'
      ? book.price + 20
      : bookType === 'supreme'
      ? book.price + 50
      : book.price
    : 0;
  const isSupreme = bookType === 'supreme';
  const requiresVoiceSample = bookType === 'supreme';
  const isMobile = windowWidth < 768;
  const mobilePreviewScale = Math.min(0.58, Math.max(0.4, (windowWidth - 24) / (PAGE_WIDTH * 2)));
  const previewScale = isMobile ? mobilePreviewScale : 1;
  const previewStageHeight = isMobile ? Math.round(PREVIEW_HEIGHT * previewScale) + 12 : PREVIEW_HEIGHT;
  const previewShareImageUrl = previewPages[0] || previewUrl || resolvedBook?.coverUrl || null;
  const maxSpreadIndex = Math.max(TOTAL_SPREADS, Math.max(0, previewPages.length - 1));
  const currentVoiceSample = useMemo(() => {
    if (!voiceAssetId) return null;
    return recentVoices.find((voice) => voice.asset_id === voiceAssetId) ?? null;
  }, [recentVoices, voiceAssetId]);

  const resolvedVoiceSignedUrl = voiceSignedUrl || currentVoiceSample?.signed_url || null;
  const showcaseImages = useMemo(() => {
    if (!resolvedBook) return [];
    const images = Array.isArray(resolvedBook.showcaseImages) ? resolvedBook.showcaseImages.filter(Boolean) : [];
    const normalized = images.length > 0 ? [...images] : [resolvedBook.coverUrl];
    while (normalized.length < 9) {
      normalized.push(resolvedBook.coverUrl);
    }
    return normalized.slice(0, 9);
  }, [resolvedBook]);
  const activeShowcaseImage = showcaseImages[activeShowcaseIndex] || showcaseImages[0] || resolvedBook?.coverUrl || '';
  const bookFaqItems = useMemo(() => {
    const storyTitle = templateTitle || book?.title || 'this story';
    return [
      {
        question: t('personalize.bookFaq1Question'),
        answer: t('personalize.bookFaq1Answer', { title: storyTitle }),
      },
      {
        question: t('personalize.bookFaq2Question'),
        answer: t('personalize.bookFaq2Answer'),
      },
      {
        question: t('personalize.bookFaq3Question'),
        answer: t('personalize.bookFaq3Answer'),
      },
    ];
  }, [book?.title, t, templateTitle]);

  useEffect(() => {
    setActiveShowcaseIndex(0);
  }, [bookID]);

  useEffect(() => {
    if (!viewState.showForm) return;
    if (showcaseImages.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveShowcaseIndex((prev) => (prev + 1) % showcaseImages.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [showcaseImages.length, viewState.showForm]);

  useEffect(() => {
    if (showcaseImages.length === 0) return;
    setActiveShowcaseIndex((prev) => (prev >= showcaseImages.length ? 0 : prev));
  }, [showcaseImages.length]);

  useEffect(() => {
    if (isMobile) return;
    const rowNode = showcaseRowRef.current;
    const node = mainShowcaseRef.current;
    const uploadNode = uploadPanelRef.current;
    if (!node || !rowNode || !uploadNode) return;

    const GAP = 8;
    const MIN_THUMB_SIZE = 68;
    const MAX_THUMB_SIZE = 76;
    const COLUMN_GAP = 12;
    const SCROLL_SLOT = 8;
    const MIN_MAIN_SIZE = 420;

    const recompute = () => {
      const rowRect = rowNode.getBoundingClientRect();
      const uploadRect = uploadNode.getBoundingClientRect();
      const rowWidth = rowNode.getBoundingClientRect().width;
      const desiredMainSize = Math.floor(uploadRect.bottom - rowRect.top);
      if (!desiredMainSize || !rowWidth) return;

      const solveForVisibleCount = (count: number) => {
        const maxSizeByWidth = Math.floor(
          (
            rowWidth
            - COLUMN_GAP
            - SCROLL_SLOT
            + (GAP * (count - 1)) / count
          ) / (1 + 1 / count)
        );
        const nextMainSize = Math.max(MIN_MAIN_SIZE, Math.min(desiredMainSize, maxSizeByWidth));
        const nextThumbSize = Math.floor((nextMainSize - GAP * (count - 1)) / count);
        return { mainSize: nextMainSize, thumbSize: nextThumbSize };
      };

      const optionSix = solveForVisibleCount(6);
      const optionFive = solveForVisibleCount(5);
      const preferred = optionSix.thumbSize >= MIN_THUMB_SIZE ? optionSix : optionFive;
      const clampedThumbSize = Math.min(MAX_THUMB_SIZE, Math.max(preferred.thumbSize, MIN_THUMB_SIZE));

      setDesktopMainShowcaseSize(preferred.mainSize);
      setDesktopShowcaseThumbSize(clampedThumbSize);
      setDesktopThumbColumnWidth(clampedThumbSize + SCROLL_SLOT);
    };

    recompute();

    const observer = new ResizeObserver(recompute);
    observer.observe(rowNode);
    observer.observe(uploadNode);
    observer.observe(node);

    return () => observer.disconnect();
  }, [isMobile, resolvedBook?.coverUrl, showcaseImages.length, windowWidth]);

  useEffect(() => {
    const viewport = showcaseThumbViewportRef.current;
    const target = showcaseThumbRefs.current[activeShowcaseIndex];
    if (!viewport || !target) return;

    if (isMobile) {
      const targetCenter = target.offsetLeft + target.offsetWidth / 2;
      const nextLeft = Math.max(0, targetCenter - viewport.clientWidth / 2);
      viewport.scrollTo({ left: nextLeft, behavior: 'smooth' });
      return;
    }

    const buffer = 8;
    const currentTop = viewport.scrollTop;
    const targetTop = target.offsetTop;
    const targetBottom = targetTop + target.offsetHeight;
    const viewportTop = currentTop;
    const viewportBottom = currentTop + viewport.clientHeight;

    let nextTop = currentTop;

    if (targetTop < viewportTop + buffer) {
      nextTop = Math.max(0, targetTop - buffer);
    } else if (targetBottom > viewportBottom - buffer) {
      nextTop = targetBottom - viewport.clientHeight + buffer;
    }

    if (nextTop !== currentTop) {
      viewport.scrollTo({ top: nextTop, behavior: 'smooth' });
    }
  }, [activeShowcaseIndex, isMobile]);

  useEffect(() => {
    if (!viewState.showLoading) {
      setLoadingCountdownSeconds(40);
      return;
    }

    setLoadingCountdownSeconds(40);

    const interval = window.setInterval(() => {
      setLoadingCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [viewState.showLoading]);

  // Determine Visual State for Animations
  const isClosing = isFlipping && flipDirection === 'prev' && currentSpread === 1;
  const isVisualBookOpen = currentSpread > 0 || (isFlipping && flipDirection === 'next' && currentSpread === 0);
  const isBookClosed = !isVisualBookOpen;

  //FSM??扯?銝甈～???
  const didInitFSM = useRef(false);

  /*銝湔debug
  useEffect(() => {
  console.log('[FSM] stage =', stage, 'uiProgress =', uiProgress)
    }, [stage, uiProgress])*/

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (didInitFSM.current) return
    if (!bookID) return

    if (resumeData && resumeData.bookID === bookID) {
        fsm.restore({
        hasDraft: !!resumeData.personalization,
        savedStage: viewMode === 'preview' ? 'PREVIEW' : 'FORM',
        })
    } else if (viewMode === 'preview' && (creationIdParam || previewJobIdParam)) {
        fsm.restore({
        hasDraft: true,
        savedStage: 'PREVIEW',
        })
    } else {
        fsm.startForm()
    }

    didInitFSM.current = true
  }, [bookID, resumeData, fsm, viewMode, creationIdParam, previewJobIdParam])



  useEffect(() => {
    if (!resumeData) return
    if (resumeData.bookID !== bookID) return

    const data = resumeData.personalization
    if (!data) return

    setName(data.childName || '')
    setAge(data.childAge || '')
    setSelectedLang(normalizeStoryLanguage(data.language))
    setBookType(data.bookType || 'basic')
    setPhotoPreview(data.photoUrl || null)
    setPhotoAssetId(data.assetId || null)
    setPhotoStoragePath(data.storagePath || null)
    setFaceImageUrl(data.faceImageUrl || null)
    setVoiceAssetId(data.voiceAssetId || null)
    setVoiceStoragePath(data.voiceStoragePath || null)
    setVoiceSignedUrl(null)
    setPreviewJobId(isUuid(data.previewJobId) ? data.previewJobId : null)
    setCreationId(data.creationId ?? null)
    resumePersonalization(null)
  }, [resumeData, bookID, setName, setAge, setSelectedLang, setBookType, setPhotoPreview, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setVoiceAssetId, setVoiceStoragePath, setPreviewJobId, setCreationId, resumePersonalization])

  useEffect(() => {
    if (resumeData && resumeData.bookID !== bookID) {
      resumePersonalization(null)
    }
  }, [resumeData, bookID, resumePersonalization])

  const resolveCreationId = useCallback(async () => {
    if (creationId) return creationId
    if (creationIdParam && isUuid(creationIdParam)) {
      setCreationId(creationIdParam)
      return creationIdParam
    }
    if (typeof window !== 'undefined') {
      const fromLocation = new URLSearchParams(window.location.search).get('creationId')
      if (fromLocation && isUuid(fromLocation)) {
        setCreationId(fromLocation)
        return fromLocation
      }
    }
    const fallbackJobId = previewJobId ?? previewJobIdParam
    if (!fallbackJobId) return null
    try {
      const url = user?.customerId
        ? `/api/creations/resolve?jobId=${encodeURIComponent(fallbackJobId)}&customerId=${encodeURIComponent(
            user.customerId
          )}`
        : `/api/creations/resolve?jobId=${encodeURIComponent(fallbackJobId)}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) return null
      const data = await res.json()
      if (data?.creationId) {
        setCreationId(data.creationId)
        return data.creationId as string
      }
    } catch {
      // no-op
    }
    return null
  }, [creationId, creationIdParam, previewJobId, previewJobIdParam, user?.customerId])

  useEffect(() => {
    if (creationIdParam && isUuid(creationIdParam)) {
      setCreationId((prev) => (prev ? prev : creationIdParam))
    }
    if (previewJobIdParam && isUuid(previewJobIdParam)) {
      setPreviewJobId((prev) => (prev ? prev : previewJobIdParam))
    }
  }, [creationIdParam, previewJobIdParam, setCreationId, setPreviewJobId])

  useEffect(() => {
    if (viewMode !== 'preview') return
    if (!creationId) return
    if (previewPages.length > 0) return

    if (typeof window === 'undefined') return
    const cacheKey = `ymi_preview_${creationId}`
    const cached = window.sessionStorage.getItem(cacheKey)
    if (!cached) return
    try {
      const parsed = JSON.parse(cached)
      const coverUrl = parsed?.coverUrl
      if (coverUrl) {
        setPreviewPages([coverUrl])
        setPreviewUrl(coverUrl)
      }
      if (!previewJobId && parsed?.jobId) {
        setPreviewJobId(parsed.jobId)
      }
    } catch {
      // ignore cache errors
    }
  }, [viewMode, creationId, previewPages.length, previewJobId])

  useEffect(() => {
    if (viewMode !== 'preview') return
    if (!previewJobId) return
    let isActive = true

    const loadPreview = async () => {
      try {
        const urls = await getPreviewPages(previewJobId, undefined, { size: 'small' })
        if (!isActive) return
        setPreviewPages(urls)
        if (urls[0]) {
          setPreviewUrl(urls[0])
        }
      } catch {
        // no-op
      }
    }

    loadPreview()

    return () => {
      isActive = false
    }
  }, [viewMode, previewJobId])

  useEffect(() => {
    if (viewMode !== 'preview') return
    if (!creationId) return

    let isActive = true
    const cacheKey = `ymi_creation_${creationId}`

    const loadCreation = async () => {
      try {
        if (typeof window !== 'undefined') {
          const cached = window.sessionStorage.getItem(cacheKey)
          if (cached) {
            try {
              const parsed = JSON.parse(cached)
              const creation = parsed?.creation ?? parsed
              if (creation) {
                if (!previewJobId && creation.preview_job_id) {
                  setPreviewJobId(creation.preview_job_id)
                }

                const snapshot = creation.customize_snapshot ?? {}
                const overrides = snapshot.textOverrides ?? snapshot.text_overrides ?? {}
                const nextName = overrides.child_name ?? overrides.childName ?? ''
                const nextAge = overrides.child_age ?? overrides.childAge ?? overrides.age ?? ''
                const nextLang = overrides.language ?? snapshot.language ?? 'English'
                const nextType = overrides.book_type ?? snapshot.bookType ?? 'basic'

                if (nextName) setName(String(nextName))
                if (nextAge !== undefined && nextAge !== null) setAge(String(nextAge))
                if (nextLang) setSelectedLang(normalizeStoryLanguage(nextLang))
                if (nextType) setBookType(nextType as any)

                if (!templateTitle && creation.templates?.name) {
                  setTemplateTitle(creation.templates.name)
                }
                if (!templateDescription && creation.templates?.description) {
                  setTemplateDescription(creation.templates.description)
                }
                if (!templateCoverUrl && creation.templates?.cover_image_path) {
                  const rawPath = String(creation.templates.cover_image_path || '').trim()
                  if (rawPath) {
                    if (rawPath.startsWith('http')) {
                      setTemplateCoverUrl(rawPath)
                    } else {
                      const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '')
                      const { data: publicUrl } = supabase.storage.from('app-templates').getPublicUrl(cleaned)
                      if (publicUrl?.publicUrl) {
                        setTemplateCoverUrl(publicUrl.publicUrl)
                      }
                    }
                  }
                }
              }
            } catch {
              // ignore cache parse errors
            }
          }
        }

        const url = user?.customerId
          ? `/api/creations/${encodeURIComponent(creationId)}?customerId=${encodeURIComponent(user.customerId)}`
          : `/api/creations/${encodeURIComponent(creationId)}`
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (!isActive) return
        const creation = data?.creation
        if (!creation) return

        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ creation }))
        }

        if (!previewJobId && creation.preview_job_id) {
          setPreviewJobId(creation.preview_job_id)
        }

        const snapshot = creation.customize_snapshot ?? {}
        const overrides = snapshot.textOverrides ?? snapshot.text_overrides ?? {}
        const nextName = overrides.child_name ?? overrides.childName ?? ''
        const nextAge = overrides.child_age ?? overrides.childAge ?? overrides.age ?? ''
        const nextLang = overrides.language ?? snapshot.language ?? 'English'
        const nextType = overrides.book_type ?? snapshot.bookType ?? 'basic'

        if (nextName) setName(String(nextName))
        if (nextAge !== undefined && nextAge !== null) setAge(String(nextAge))
        if (nextLang) setSelectedLang(normalizeStoryLanguage(nextLang))
        if (nextType) setBookType(nextType as any)

        if (!templateTitle && creation.templates?.name) {
          setTemplateTitle(creation.templates.name)
        }
        if (!templateDescription && creation.templates?.description) {
          setTemplateDescription(creation.templates.description)
        }
        if (!templateCoverUrl && creation.templates?.cover_image_path) {
          const rawPath = String(creation.templates.cover_image_path || '').trim()
          if (rawPath) {
            if (rawPath.startsWith('http')) {
              setTemplateCoverUrl(rawPath)
            } else {
              const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '')
              const { data: publicUrl } = supabase.storage.from('app-templates').getPublicUrl(cleaned)
              if (publicUrl?.publicUrl) {
                setTemplateCoverUrl(publicUrl.publicUrl)
              }
            }
          }
        }
      } catch {
        // no-op
      }
    }

    loadCreation()

    return () => {
      isActive = false
    }
  }, [viewMode, creationId, user?.customerId, previewJobId, name, age, selectedLang, bookType, templateTitle, templateDescription, templateCoverUrl, setName, setAge, setSelectedLang, setBookType, setTemplateTitle, setTemplateDescription, setTemplateCoverUrl])

  useEffect(() => {
    if (resumeData && resumeData.bookID === bookID) return
    if (
      viewMode === 'preview' &&
      (creationIdParam || creationId || previewJobIdParam || previewJobId)
    ) {
      return
    }
    if (stage === 'GENERATING' || stage === 'PREVIEW') {
      return
    }

    setName('')
    setAge('')
    setSelectedLang('English')
    setBookType('basic')
    setPhoto(null)
    setPhotoPreview(null)
    setPhotoAssetId(null)
    setPhotoStoragePath(null)
    setFaceImageUrl(null)
    setTemplateCoverUrl(null)
    setTemplateTitle(null)
    setTemplateDescription(null)
    setRecentFaces([])
    setVoiceAssetId(null)
    setVoiceStoragePath(null)
    setVoiceSignedUrl(null)
    setVoiceValidationError(null)
    setPreviewJobId(null)
    setCreationId(null)
    setPreviewUrl(null)
    setPreviewPages([])
  }, [bookID, resumeData, viewMode, creationIdParam, creationId, previewJobIdParam, previewJobId, stage, setName, setAge, setSelectedLang, setBookType, setPhoto, setPhotoPreview, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setVoiceAssetId, setVoiceStoragePath, setPreviewJobId, setCreationId, setPreviewUrl, setTemplateCoverUrl, setTemplateTitle, setTemplateDescription])

  const replacePersonalizeUrl = useCallback((params?: URLSearchParams | null) => {
    if (typeof window === 'undefined') return;
    const query = params?.toString();
    const nextUrl = query ? `/personalize/${bookID}?${query}` : `/personalize/${bookID}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [bookID]);

  const replacePreviewUrl = useCallback((nextCreationId: string, nextJobId: string) => {
    const params = new URLSearchParams();
    params.set('view', 'preview');
    params.set('creationId', nextCreationId);
    params.set('jobId', nextJobId);
    replacePersonalizeUrl(params);
  }, [replacePersonalizeUrl]);

  useEffect(() => {
    if (stage !== 'GENERATING') return;
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    previewCancelRequestedRef.current = false;

    let isActive = true;
    let textInterval: number | null = null;
    let progressInterval: number | null = null;
    let progressTarget = 6;
    let lastRampAt = Date.now();
    const startedAt = Date.now();
    const PREVIEW_MAX_WAIT_MS = 10 * 60 * 1000;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const getPreviewPollDelayMs = () => {
      const elapsed = Date.now() - startedAt;
      const base = elapsed < 20_000 ? 1500 : elapsed < 60_000 ? 2500 : 4000;
      return base + Math.floor(Math.random() * 180);
    };
    const getPreviewAssetRetryDelayMs = (attempt: number) =>
      Math.min(1400, 250 + attempt * 250) + Math.floor(Math.random() * 90);
    const loadReadyPreviewAssets = async (jobId: string) => {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const urls = await getPreviewPages(jobId, undefined, { size: 'small' });
          if (urls.length) {
            return {
              urls,
              primaryUrl: urls[0] ?? null,
            };
          }

          const url = await getPreviewUrl(jobId);
          if (url) {
            return {
              urls: [url],
              primaryUrl: url,
            };
          }
        } catch (error) {
          lastError = error;
        }

        if (attempt < 5) {
          await wait(getPreviewAssetRetryDelayMs(attempt));
        }
      }

      if (lastError) throw lastError;
      throw new Error('Preview is ready but images are still processing. Please refresh.');
    };
    const loadPartialPreviewAssets = async (jobId: string) => {
      try {
        const urls = await getPreviewPages(jobId, undefined, { size: 'small' });
        if (urls.length) {
          return {
            urls,
            primaryUrl: urls[0] ?? null,
          };
        }
      } catch {
        // Partial preview is not ready yet.
      }
      return null;
    };

    setPreviewError(null);
    setProgress(0);

    const messages = [
      t('personalize.printingMagic'),
      t('personalize.creatingStorybook'),
      `${t('common.loading')} ${selectedLang}...`,
      t('personalize.didYouKnow'),
      t('personalize.printingMagic'),
      t('common.loading')
    ];

    let i = 0;
    setLoadingText(messages[0]);

    textInterval = window.setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingText(messages[i]);
    }, 4200);

    progressInterval = window.setInterval(() => {
      const now = Date.now();
      if (now - lastRampAt >= 2500) {
        const elapsed = now - startedAt;
        const cap = elapsed < 30_000 ? 40 : elapsed < 90_000 ? 68 : elapsed < 180_000 ? 82 : 90;
        if (progressTarget < cap) {
          progressTarget += 1;
        }
        lastRampAt = now;
      }

      setProgress(prev => {
        if (prev >= progressTarget) return prev;
        const remaining = progressTarget - prev;
        const step = remaining > 20 ? 3 : remaining > 8 ? 2 : 1;
        return Math.min(progressTarget, prev + step);
      });
    }, 220);

    const run = async () => {
      try {
        if (!book) throw new Error('Book not found')
        if (!photo && !photoAssetId) throw new Error('Please upload a photo before generating the preview')

        setPreviewUrl(null)
        setPreviewPages([])

        let faceAssetId = photoAssetId

        if (photo) {
          const faceAsset = await uploadUserAsset(photo, 'face_image', 'face', user?.customerId)
          if (!isActive) return
          setPhotoAssetId(faceAsset.asset_id)
          setPhotoStoragePath(faceAsset.storage_path)
          setFaceImageUrl(faceAsset.signed_url ?? null)
          faceAssetId = faceAsset.asset_id
        }

        const parsedAge = Number.parseInt(age, 10)
        const textOverrides = {
          child_name: name,
          child_age: Number.isNaN(parsedAge) ? age : parsedAge,
          dedication: '',
          language: selectedLang,
          book_type: bookType,
        }

        if (!user?.customerId && name && age) {
          fetch('/api/user/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              child_name: name,
              child_age: Number.isNaN(parsedAge) ? age : parsedAge,
              customerId: null,
            }),
            credentials: 'include',
          }).catch(() => {})
        } else if (user?.customerId && name && age) {
          fetch('/api/user/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              child_name: name,
              child_age: Number.isNaN(parsedAge) ? age : parsedAge,
              customerId: user.customerId,
            }),
            credentials: 'include',
          }).catch(() => {})
        }

        if (!faceAssetId) {
          throw new Error('Missing face asset for preview')
        }

        const created = await createPreviewJob(
          book.bookID,
          faceAssetId,
          textOverrides,
          undefined,
          user?.customerId
        )
        if (!created?.jobId) {
          throw new Error('Preview job missing jobId')
        }
        if (previewCancelRequestedRef.current) {
          try {
            await cancelPreviewJob(created.jobId, {
              creationId: created.creationId,
              customerId: user?.customerId ?? null,
            })
          } catch (error) {
            console.warn('Failed to cancel preview job after creation:', error)
          }
          return
        }
        if (!isActive) return
        setPreviewJobId(created.jobId)
        setCreationId(created.creationId)
        if (!isActive) return

        let fetchFailures = 0
        let partialPreviewShown = false
        while (isActive) {
          let job
          try {
            job = await getJob(created.jobId)
            fetchFailures = 0
          } catch (err) {
            fetchFailures += 1
            if (fetchFailures >= 8) {
              throw err
            }
            await wait(getPreviewPollDelayMs())
            continue
          }
          const serverProgress =
            typeof job.progress === 'number' && Number.isFinite(job.progress)
              ? Math.max(0, Math.min(95, job.progress))
              : null
          if (serverProgress !== null) {
            progressTarget = Math.max(progressTarget, serverProgress)
          }

          if (job.status === 'done') {
            progressTarget = Math.max(progressTarget, 96)
            setProgress(prev => (prev < 96 ? 96 : prev))
            try {
              const previewAssets = await loadReadyPreviewAssets(created.jobId)
              if (!isActive) return
              setPreviewPages(previewAssets.urls)
              if (previewAssets.primaryUrl) {
                setPreviewUrl(previewAssets.primaryUrl)
              }
            } catch {
              if (!isActive) return
              setPreviewError('Preview is ready but images failed to load. Please refresh.')
            }
            replacePreviewUrl(created.creationId, created.jobId)
            setProgress(100)
            finishGenerating()
            return
          }

          if (job.status === 'running' && !partialPreviewShown) {
            const partialPreviewAssets = await loadPartialPreviewAssets(created.jobId)
            if (partialPreviewAssets?.urls.length) {
              partialPreviewShown = true
              if (!isActive) return
              setPreviewPages(partialPreviewAssets.urls)
              if (partialPreviewAssets.primaryUrl) {
                setPreviewUrl(partialPreviewAssets.primaryUrl)
              }
              replacePreviewUrl(created.creationId, created.jobId)
              setProgress(100)
              finishGenerating()
              return
            }
          }

          if (job.status === 'failed') {
            throw new Error(job.error_message || 'Preview generation failed. Please try again.')
          }

          if (job.status === 'cancel_requested' || job.status === 'cancelled') {
            return
          }

          if (Date.now() - startedAt > PREVIEW_MAX_WAIT_MS) {
            throw new Error('Preview generation timed out. Please try again.')
          }

          await wait(getPreviewPollDelayMs())
        }
      } catch (error: any) {
        if (!isActive) return
        if (previewCancelRequestedRef.current) {
          return
        }
        setPreviewError(error?.message ?? 'Preview generation failed.')
        setProgress(0)
        reset()
      } finally {
        generationInFlightRef.current = false;
      }
    }

    run()

    return () => {
      isActive = false;
      if (textInterval) window.clearInterval(textInterval);
      if (progressInterval) window.clearInterval(progressInterval);
    };
  }, [stage, selectedLang, finishGenerating, setProgress, setLoadingText, book, photo, user, reset, replacePreviewUrl, t]);

  useEffect(() => {
    if (!viewState.showPreview) return;
    if (!previewJobId) return;
    if (previewPages.length >= 2) return;

    let isActive = true;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const pollForRemainingPreviewPages = async () => {
      while (isActive) {
        try {
          const urls = await getPreviewPages(previewJobId, undefined, { size: 'small' });
          if (!isActive) return;
          if (urls.length > previewPages.length) {
            setPreviewPages(urls);
            if (urls[0]) {
              setPreviewUrl(urls[0]);
            }
          }

          const job = await getJob(previewJobId);
          if (!isActive) return;
          if (job.status === 'done' && urls.length >= 2) {
            return;
          }
          if (job.status === 'failed') {
            setPreviewError(job.error_message || 'Preview generation failed. Please try again.');
            return;
          }
          if (job.status === 'cancel_requested' || job.status === 'cancelled') {
            return;
          }
        } catch {
          // The second preview page may still be rendering; keep polling quietly.
        }

        await wait(2500);
      }
    };

    void pollForRemainingPreviewPages();

    return () => {
      isActive = false;
    };
  }, [viewState.showPreview, previewJobId, previewPages.length]);

  useEffect(() => {
    if (!bookID) return;

    let isActive = true;

    const loadTemplateInfo = async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('name, description, cover_image_path')
        .eq('template_id', bookID)
        .maybeSingle();

      if (!isActive) return;
      if (error || !data) return;

      const rawPath = String(data.cover_image_path || '').trim();
      let coverUrl: string | null = null;
      if (rawPath) {
        if (rawPath.startsWith('http')) {
          coverUrl = rawPath;
        } else {
          const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '');
          const { data: publicUrl } = supabase.storage.from('app-templates').getPublicUrl(cleaned);
          coverUrl = publicUrl?.publicUrl ?? null;
        }
      }

      setTemplateCoverUrl(coverUrl);
      setTemplateTitle(typeof data.name === 'string' ? data.name : null);
      setTemplateDescription(typeof data.description === 'string' ? data.description : null);
    };

    loadTemplateInfo();

    return () => {
      isActive = false;
    };
  }, [bookID]);

  useEffect(() => {
    let isActive = true;

    const loadUserAssets = async () => {
      const params = user?.customerId ? `?customerId=${user.customerId}` : '';
      const response = await fetch(`/api/user-assets${params}`, { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!isActive) return;
      const faces = Array.isArray(data?.faces) ? data.faces : [];
      const voices = Array.isArray(data?.voices) ? data.voices : [];
      setRecentFaces(faces);
      setRecentVoices(voices);
    };

    loadUserAssets();

    return () => {
      isActive = false;
    };
  }, [user?.customerId]);

  useEffect(() => {
    setRecentProfiles([]);
    setRecentVoices([]);
  }, [user?.customerId]);

  useEffect(() => {
    if (voiceSignedUrl) return;
    if (!currentVoiceSample?.signed_url) return;
    setVoiceSignedUrl(currentVoiceSample.signed_url);
  }, [currentVoiceSample?.signed_url, voiceSignedUrl]);

  useEffect(() => {
    if (!requiresVoiceSample || voiceAssetId) {
      setVoiceValidationError(null);
    }
  }, [requiresVoiceSample, voiceAssetId]);

  useEffect(() => {
    if (!voiceValidationError) return;
    if (!requiresVoiceSample) return;
    if (!viewState.showForm) return;
    const id = window.setTimeout(() => {
      voicePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [requiresVoiceSample, viewState.showForm, voiceValidationError]);

  const loadProfiles = useCallback(async () => {
    const params = user?.customerId ? `?customerId=${user.customerId}` : '';
    const response = await fetch(`/api/user/profiles${params}`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    setRecentProfiles(profiles);
  }, [user?.customerId]);

  useEffect(() => {
    if (!previewPages.length) return

    previewPages.forEach((url) => {
      if (!url) return
      const img = new Image()
      img.decoding = 'async'
      img.src = url
    })
  }, [previewPages])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (nameBoxRef.current && nameBoxRef.current.contains(target)) {
        return;
      }
      if (ageBoxRef.current && ageBoxRef.current.contains(target)) {
        return;
      }
      if (languageBoxRef.current && languageBoxRef.current.contains(target)) {
        return;
      }
      setShowNameHistory(false);
      setShowAgeHistory(false);
      setShowLanguageOptions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);




  // --- Handlers ---
  const handleDeleteFace = useCallback(async (assetId: string) => {
    setRecentFaces((prev) => prev.filter((face) => face.asset_id !== assetId));
    if (photoAssetId === assetId) {
      setPhotoAssetId(null);
      setPhotoStoragePath(null);
      setFaceImageUrl(null);
      setPhotoPreview(null);
    }

    try {
      await fetch('/api/user-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          customerId: user?.customerId ?? null,
        }),
        credentials: 'include',
      });
    } catch (e) {
      // no-op
    }
  }, [user?.customerId, photoAssetId, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setPhotoPreview]);

  const handleDeleteProfile = useCallback(async (payload: { assetId?: string; field?: 'name' | 'age'; value?: string | number }) => {
    if (payload.assetId) {
      setRecentProfiles((prev) => prev.filter((profile) => profile.asset_id !== payload.assetId));
    } else if (payload.field && payload.value !== undefined && payload.value !== null) {
      const targetValue = String(payload.value);
      setRecentProfiles((prev) => {
        const next: RecentProfileItem[] = []
        for (const profile of prev) {
          const meta = { ...(profile.metadata || {}) } as Record<string, unknown>
          const nameValue = meta.name ?? meta.child_name
          const ageValue = meta.age ?? meta.child_age

          if (payload.field === 'name') {
            if (nameValue !== undefined && nameValue !== null && String(nameValue) === targetValue) {
              delete meta.name
              delete meta.child_name
            }
          } else if (payload.field === 'age') {
            if (ageValue !== undefined && ageValue !== null && String(ageValue) === targetValue) {
              delete meta.age
              delete meta.child_age
            }
          }

          const remainingName = meta.name ?? meta.child_name
          const remainingAge = meta.age ?? meta.child_age
          const hasName = remainingName !== undefined && remainingName !== null && String(remainingName).length > 0
          const hasAge = remainingAge !== undefined && remainingAge !== null && String(remainingAge).length > 0

          if (hasName || hasAge) {
            next.push({ ...profile, metadata: meta as RecentProfileItem['metadata'] })
          }
        }
        return next
      });
    }

    try {
      const body = payload.assetId
        ? { asset_id: payload.assetId, customerId: user?.customerId ?? null }
        : {
            field: payload.field,
            value: payload.value,
            customerId: user?.customerId ?? null,
          }
      const response = await fetch('/api/user/profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!response.ok) return;
    } catch (e) {
      // no-op
    }
  }, [user?.customerId, loadProfiles]);

  const handleBack = () => {
    if (!fsm.canBack) return

    switch (fsm.backIntent) {
        case 'EXIT_FLOW':
        router.push('/')
        break

        case 'CONFIRM_EXIT':
        setShowExitConfirm(true)
        break

        default:
        break
    }
    }



  const dismissExitConfirm = useCallback(() => {
    setShowExitConfirm(false);
  }, []);


  const triggerFlyToCart = useCallback(() => {
    const originRect = addToCartBtnRef.current?.getBoundingClientRect();
    const targetRect = cartIconRef.current?.getBoundingClientRect();

    if (!originRect || !targetRect) return;

    setFlyOrigin({
      x: originRect.left + originRect.width / 2 - 25,
      y: originRect.top + originRect.height / 2 - 35,
    });

    setFlyTarget({
      x: targetRect.left + targetRect.width / 2 - 10,
      y: targetRect.top + targetRect.height / 2 - 10,
    });

    setShowFlyAnimation(true);
    window.setTimeout(() => setShowFlyAnimation(false), 800);
  }, []);

  const triggerPreviewCancelledToast = useCallback(() => {
    setShowPreviewCancelledToast(true);
    if (previewCancelToastTimerRef.current) {
      window.clearTimeout(previewCancelToastTimerRef.current);
    }
    previewCancelToastTimerRef.current = window.setTimeout(() => {
      setShowPreviewCancelledToast(false);
      previewCancelToastTimerRef.current = null;
    }, 1800);
  }, []);

  const persistDraftForCustomizeReturn = useCallback((options?: { clearPreviewRefs?: boolean }) => {
    if (!book) return;
    const clearPreviewRefs = options?.clearPreviewRefs === true

    resumePersonalization({
      id: clearPreviewRefs ? `draft-${bookID}` : creationId ?? `draft-${bookID}`,
      creationId: clearPreviewRefs ? undefined : creationId ?? undefined,
      bookID: book.bookID,
      quantity: 1,
      book: resolvedBook ?? book,
      personalization: {
        childName: name,
        childAge: age,
        language: selectedLang,
        dedication: '',
        bookType,
        photo: photo ?? undefined,
        photoUrl: photoPreview ?? undefined,
        assetId: photoAssetId ?? undefined,
        storagePath: photoStoragePath ?? undefined,
        faceImageUrl: faceImageUrl ?? undefined,
        voiceAssetId: voiceAssetId ?? undefined,
        voiceStoragePath: voiceStoragePath ?? undefined,
        previewJobId: clearPreviewRefs ? undefined : previewJobId ?? undefined,
        creationId: clearPreviewRefs ? undefined : creationId ?? undefined,
      },
      savedStep: 2,
      priceAtPurchase: currentPrice,
    });
  }, [
    age,
    book,
    bookID,
    bookType,
    creationId,
    currentPrice,
    faceImageUrl,
    name,
    photo,
    photoAssetId,
    photoPreview,
    photoStoragePath,
    previewJobId,
    resolvedBook,
    resumePersonalization,
    selectedLang,
    voiceAssetId,
    voiceStoragePath,
  ]);

  const requestPreviewCancellation = useCallback(
    async (options?: { jobId?: string | null; creationId?: string | null; showToast?: boolean }) => {
      previewCancelRequestedRef.current = true;

      const targetJobId = options?.jobId ?? previewJobId;
      const targetCreationId = options?.creationId ?? creationId;

      persistDraftForCustomizeReturn({ clearPreviewRefs: true });
      setPreviewError(null);
      setPreviewJobId(null);
      setCreationId(null);
      setPreviewUrl(null);
      setPreviewPages([]);
      setProgress(0);
      fsm.startForm();

      if (options?.showToast !== false) {
        triggerPreviewCancelledToast();
      }

      if (!targetJobId) return;

      try {
        await cancelPreviewJob(targetJobId, {
          creationId: targetCreationId ?? null,
          customerId: user?.customerId ?? null,
        });
      } catch (error) {
        console.warn('Failed to cancel preview job:', error);
      }
    },
    [
      creationId,
      fsm,
      persistDraftForCustomizeReturn,
      previewJobId,
      setCreationId,
      setPreviewJobId,
      setPreviewPages,
      setPreviewUrl,
      setProgress,
      triggerPreviewCancelledToast,
      user?.customerId,
    ]
  );

  useEffect(() => {
    if (stage !== 'GENERATING') return;
    if (typeof window === 'undefined') return;

    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get('view') !== 'loading') {
      currentParams.set('view', 'loading');
      const nextUrl = `/personalize/${bookID}?${currentParams.toString()}`;
      window.history.pushState({ ...window.history.state, ymiPersonalizeStage: 'loading' }, '', nextUrl);
    }

    const handlePopState = () => {
      const currentView = new URLSearchParams(window.location.search).get('view') || 'edit';
      if (currentView === 'loading') return;
      void requestPreviewCancellation();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [bookID, requestPreviewCancellation, stage]);

  useEffect(() => {
    if (stage !== 'FORM') return;
    if (viewMode !== 'loading') return;
    replacePersonalizeUrl(null);
  }, [replacePersonalizeUrl, stage, viewMode]);

  const returnToCustomizeFromPreview = useCallback(() => {
    persistDraftForCustomizeReturn();
    setShowExitConfirm(false);
    router.replace(`/personalize/${bookID}`);
    fsm.startForm();
  }, [bookID, fsm, persistDraftForCustomizeReturn, router]);

  const ensurePremiumVoiceSample = useCallback(() => {
    if (!requiresVoiceSample) {
      setVoiceValidationError(null);
      return true;
    }
    if (voiceAssetId) {
      setVoiceValidationError(null);
      return true;
    }

    setVoiceValidationError(t('personalize.voiceSampleRequired'));
    if (stage === 'PREVIEW') {
      returnToCustomizeFromPreview();
    } else {
      voicePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  }, [requiresVoiceSample, stage, voiceAssetId, returnToCustomizeFromPreview]);

  const handleVoiceUploadComplete = useCallback(
    ({ assetId, storagePath, signedUrl }: { assetId: string; storagePath: string; signedUrl?: string | null }) => {
      setVoiceAssetId(assetId);
      setVoiceStoragePath(storagePath);
      setVoiceSignedUrl(signedUrl ?? null);
      setVoiceValidationError(null);
    },
    []
  );


  const performAddToCart = useCallback(async () => {
    if (!fsm.canAddToCart) return
    if (!resolvedBook) return
    if (!ensurePremiumVoiceSample()) return null

    const ensuredCreationId =
      (creationIdParam && isUuid(creationIdParam) ? creationIdParam : null) ||
      (creationId && isUuid(creationId) ? creationId : null) ||
      (typeof window !== 'undefined'
        ? (() => {
            const raw = new URLSearchParams(window.location.search).get('creationId')
            return raw && isUuid(raw) ? raw : null
          })()
        : null) ||
      (await resolveCreationId())
    if (!ensuredCreationId) {
      console.error('Missing creationId for cart', {
        creationId,
        creationIdParam,
        previewJobId,
        previewJobIdParam,
        viewMode,
      })
      return null
    }

    const item = await addToCart(
        resolvedBook!,
        {
        childName: name,
        childAge: age,
        language: selectedLang,
        dedication: '',
        bookType,
        photoUrl: photoPreview ?? undefined,
        assetId: photoAssetId ?? undefined,
        storagePath: photoStoragePath ?? undefined,
        faceImageUrl: faceImageUrl ?? undefined,
        textOverrides: {
          child_name: name,
          child_age: Number.isNaN(Number.parseInt(age, 10)) ? age : Number.parseInt(age, 10),
          dedication: '',
          language: selectedLang,
          book_type: bookType,
        },
        voiceAssetId: voiceAssetId ?? undefined,
        voiceStoragePath: voiceStoragePath ?? undefined,
        previewJobId: previewJobId ?? undefined,
        creationId: ensuredCreationId ?? undefined,
        },
        flowStep,
        undefined,
        previewPages[0] || previewUrl || undefined
    )

    shouldAnimateToCartRef.current = false;
    return item ?? null;
    }, [fsm.canAddToCart, resolvedBook, addToCart, name, age, selectedLang, bookType, flowStep, photoPreview, photoAssetId, photoStoragePath, voiceAssetId, voiceStoragePath, previewJobId, creationId, creationIdParam, resolveCreationId, previewPages, previewUrl, ensurePremiumVoiceSample]);


  const performCheckout = useCallback(async () => {
        if (!fsm.canCheckout) return
        if (checkoutInFlightRef.current) return
        if (!ensurePremiumVoiceSample()) return
        checkoutInFlightRef.current = true

        try {
        if (resolvedBook) {
    const ensuredCreationId =
      (creationIdParam && isUuid(creationIdParam) ? creationIdParam : null) ||
      (creationId && isUuid(creationId) ? creationId : null) ||
      (typeof window !== 'undefined'
        ? (() => {
            const raw = new URLSearchParams(window.location.search).get('creationId')
            return raw && isUuid(raw) ? raw : null
          })()
        : null) ||
      (await resolveCreationId())
            if (!ensuredCreationId) {
              console.error('Missing creationId for cart')
              return
            }
            const personalization = {
              childName: name,
              childAge: age,
              language: selectedLang,
              dedication: '',
              bookType,
              photoUrl: photoPreview ?? undefined,
              assetId: photoAssetId ?? undefined,
              storagePath: photoStoragePath ?? undefined,
              faceImageUrl: faceImageUrl ?? undefined,
              textOverrides: {
                child_name: name,
                child_age: Number.isNaN(Number.parseInt(age, 10)) ? age : Number.parseInt(age, 10),
                dedication: '',
                language: selectedLang,
                book_type: bookType,
              },
              voiceAssetId: voiceAssetId ?? undefined,
              voiceStoragePath: voiceStoragePath ?? undefined,
              previewJobId: previewJobId ?? undefined,
              creationId: ensuredCreationId ?? undefined,
            }

            const existingItem = ensuredCreationId
              ? cart.find(item => item.creationId === ensuredCreationId)
              : undefined
            const productType =
              personalization.bookType === 'digital'
                ? 'ebook'
                : personalization.bookType === 'premium'
                ? 'audio'
                : 'physical'

            const quantity = existingItem?.quantity ?? 1
            const payload = {
              customerId: user?.customerId ?? null,
              items: [
                {
                  cartItemId: existingItem?.id ?? null,
                  creationId: ensuredCreationId ?? null,
                  productType,
                  quantity,
                  priceAtPurchase:
                    personalization.bookType === 'premium'
                      ? resolvedBook.price + 20
                      : personalization.bookType === 'supreme'
                      ? resolvedBook.price + 50
                      : resolvedBook.price,
                },
              ],
            }

            const response = await fetch('/api/orders/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            })

            if (!response.ok) {
              return
            }

            const data = await response.json()
            const cartItemId = Array.isArray(data?.cartItemIds) ? data.cartItemIds[0] : existingItem?.id
            const orderId = typeof data?.orderId === 'string' ? data.orderId : null
            const checkoutItem = existingItem ?? {
              id: cartItemId,
              bookID: resolvedBook.bookID,
              quantity,
              book: resolvedBook,
              personalization,
              savedStep: flowStep,
              priceAtPurchase: payload.items[0].priceAtPurchase,
              creationId: ensuredCreationId ?? undefined,
            }

            if (!checkoutItem?.id) return

            prepareCheckout([checkoutItem])
            router.push(orderId ? `/checkout?orderId=${orderId}` : '/checkout')
        }
        } finally {
          checkoutInFlightRef.current = false
        }
    }, [fsm.canCheckout, resolvedBook, name, age, selectedLang, bookType, photoPreview, photoAssetId, photoStoragePath, voiceAssetId, voiceStoragePath, previewJobId, creationId, creationIdParam, resolveCreationId, flowStep, prepareCheckout, router, cart, user?.customerId, ensurePremiumVoiceSample]);

  const handleAddToCartClick = () => {
    if (!fsm.canAddToCart || isExiting) return;
    if (!ensurePremiumVoiceSample()) return;
    shouldAnimateToCartRef.current = true;
    triggerFlyToCart();
    fsm.requestAddToCart();
  };

  const handleCheckoutClick = () => {
    if (!isCheckoutAcknowledged) {
      setCheckoutAcknowledgementError(true);
      return;
    }
    if (!ensurePremiumVoiceSample()) return;
    fsm.requestCheckout();
  };

  useEffect(() => {
    return () => {
      if (previewCancelToastTimerRef.current) {
        window.clearTimeout(previewCancelToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!viewState.showPreview) {
      setIsCheckoutAcknowledged(false);
      setCheckoutAcknowledgementError(false);
    }
  }, [viewState.showPreview]);

  useEffect(() => {
    if (fsm.exitPhase !== 'REQUESTED') return

    fsm.beginExitExecution()
    }, [fsm.exitPhase, fsm.beginExitExecution]);

  useEffect(() => {
    if (fsm.exitPhase !== 'EXECUTING') return
    if (exitRunningRef.current) return

    exitRunningRef.current = true;

    const run = async () => {
        try {
        switch (fsm.exitIntent) {
            case 'ADD_TO_CART':
            await performAddToCart()
            break
            case 'CHECKOUT':
            await performCheckout()
            break
            case 'EXIT':
            returnToCustomizeFromPreview()
            break
        }
        fsm.completeExit()
        } catch (e) {
        fsm.failExit()
        } finally {
        exitRunningRef.current = false;
        }
    }

    run()
    }, [fsm.exitPhase, fsm.exitIntent, fsm.completeExit, fsm.failExit, performAddToCart, performCheckout, returnToCustomizeFromPreview])




    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setPhoto(file);
          setPhotoPreview(URL.createObjectURL(file));
          setPhotoAssetId(null);
          setPhotoStoragePath(null);
          setFaceImageUrl(null);
          setPreviewUrl(null);
      }
  };


/*--------------
 *?瑟憿菟??隞????FORM / PREVIEW
 *---------------*/

  useEffect(() => {
    if (!bookID) return
    localStorage.setItem(
        `personalize:${bookID}:stage`,
        stage
    )
        }, [stage, bookID])



  // --- Flip Logic ---
  const turnPage = (direction: 'next' | 'prev') => {
      if (isFlipping) return;
      if (direction === 'next' && currentSpread >= maxSpreadIndex) return;
      if (direction === 'prev' && currentSpread <= 0) return;

      setFlipDirection(direction);
      setIsFlipping(true);
      setTimeout(() => {
          setCurrentSpread(prev => direction === 'next' ? prev + 1 : prev - 1);
          setIsFlipping(false);
          setFlipDirection(null);
      }, ANIMATION_DURATION * 1000); 
  };





  // --- Visual Assets ---
  // Texture for the "thickness" of the book (Right side) - THE STACK EFFECT
  const pageStackPattern = {
    // Sharper repeating gradient for realistic paper edges
    backgroundImage: `repeating-linear-gradient(90deg, #fdfbf7, #fdfbf7 1px, #d1d5db 2px, #fdfbf7 3px)`,
    boxShadow: 'inset 2px 0 5px rgba(0,0,0,0.1), 10px 10px 20px rgba(0,0,0,0.15)'
  };

  // Center Binding Pattern (Replaces Leather Spine/Left Stack)
  const centerBindingPattern = {
    background: `linear-gradient(90deg, #e5e5e5, #ffffff 30%, #ffffff 70%, #e5e5e5)`, 
    boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.1)', // Subtle depth
    borderRadius: '2px',
    // Logic: Opacity is 0 if closed OR closing (prevents white edge artifact)
    opacity: (isBookClosed || isClosing) ? 0 : 1, 
    transition: (isBookClosed || isClosing) ? 'none' : 'opacity 0.2s ease-in-out 0.2s'
  };

  const renderPageContent = (side: 'left' | 'right', spreadIndex: number) => {
      // Texture Logic
      const pageTexture = bookType === 'premium' 
        ? 'linear-gradient(to right, #f8f9fa, #e9ecef)' // Glossier/Cooler for premium
        : 'linear-gradient(to right, #fffdf5, #fefae0)'; // Warmer for basic
      
      const paperNoise = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

      // Deep inner shadow to simulate the binding crease/curvature
      const bindingShadow = side === 'left' 
        ? 'linear-gradient(to left, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 4%, transparent 12%)'
        : 'linear-gradient(to right, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 4%, transparent 12%)';

      const commonPageStyle = {
          background: `${pageTexture}, ${paperNoise}`,
          // Subtle highlight on the outer edge to show curvature
          boxShadow: side === 'left' 
            ? 'inset -1px 0 2px rgba(0,0,0,0.1), inset 5px 0 10px rgba(255,255,255,0.4)' 
            : 'inset 1px 0 2px rgba(0,0,0,0.1), inset -5px 0 10px rgba(255,255,255,0.4)'
      }

      // 1. Cover
      if (spreadIndex === 0 && side === 'right') {
          return (
              <div className="w-full h-full relative overflow-hidden shadow-inner rounded-r-sm border-l border-white/20" style={commonPageStyle}>
                  {/* Hardcover Shine Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/10 z-20 pointer-events-none" />
                  
                  <img
                    src={previewPages[0] || templateCoverUrl || book?.coverUrl || ''}
                    alt={resolvedBook?.title || book?.title || t('personalize.preview')}
                    className="w-full h-full object-cover mix-blend-multiply opacity-95"
                    decoding="async"
                    loading="eager"
                    fetchPriority="high"
                  />
                  
                  {/* Hardcover Ridge at binding */}
                  <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 via-black/10 to-transparent z-30" />

                  {/* Photo Edit Button on Cover */}
                  <div className="absolute top-4 right-4 z-30">
                     <label className="cursor-pointer bg-white/90 hover:bg-white text-gray-800 text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                         <Camera className="h-4 w-4 text-amber-500" />
                         <span>{t('personalize.changePhoto')}</span>
                         <input type="file" onChange={handlePhotoUpload} className="hidden" accept="image/*" />
                     </label>
                  </div>
                  {!isFlipping && (
                    <div className="absolute top-1/2 right-4 transform -translate-y-1/2 animate-pulse text-white drop-shadow-lg z-30 cursor-pointer p-3 bg-black/20 rounded-full hover:bg-black/40 transition-colors"
                        onClick={(e) => { e.stopPropagation(); turnPage('next'); }}>
                        <ChevronRight className="h-8 w-8" />
                    </div>
                  )}
              </div>
          );
      }
      // Real preview spreads follow the configured preview page order after the cover.
      if (
        spreadIndex > 0 &&
        (spreadIndex < previewPages.length || (spreadIndex === 1 && previewPages.length === 1)) &&
        (side === 'left' || side === 'right')
      ) {
          const spreadImage = previewPages[spreadIndex] || '';
          const isLeftSide = side === 'left';
          return (
            <div
              className={`w-full h-full relative overflow-hidden ${isLeftSide ? 'rounded-l-sm border-r border-gray-200' : 'rounded-r-sm'}`}
              style={commonPageStyle}
            >
                {spreadImage ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={spreadImage}
                      alt="Preview spread"
                      className="absolute top-0 h-full max-w-none object-cover"
                      style={{
                        width: '200%',
                        left: isLeftSide ? '0%' : '-100%',
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-amber-50/80 px-6 text-center text-amber-900">
                    <Wand2 className="h-9 w-9 animate-pulse text-amber-500" />
                    <p className="text-sm font-semibold">{t('personalize.previewPageStillCreating')}</p>
                  </div>
                )}
                <div className="absolute inset-0 pointer-events-none z-10" style={{ background: bindingShadow }} />

                {!isFlipping && isLeftSide && (
                    <div
                      className="absolute top-1/2 left-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full bg-white/65 hover:bg-white/90 transition-colors"
                      onClick={(e) => { e.stopPropagation(); turnPage('prev'); }}
                    >
                        <ChevronLeft className="h-8 w-8 text-gray-500" />
                    </div>
                )}
                {!isFlipping && !isLeftSide && (
                    <div
                      className="absolute top-1/2 right-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full bg-white/65 hover:bg-white/90 transition-colors"
                      onClick={(e) => { e.stopPropagation(); turnPage('next'); }}
                    >
                        <ChevronRight className="h-8 w-8 text-gray-500" />
                    </div>
                )}
            </div>
          );
      }
      // 4. Locked
      if (spreadIndex === 0 && side === 'left') return null;
      const pageNum = spreadIndex * 2 + (side === 'left' ? 0 : 1);
      return (
        <div className={`w-full h-full relative overflow-hidden ${side === 'left' ? 'rounded-l-sm border-r' : 'rounded-r-sm'}`} style={commonPageStyle}>
            <div className="absolute inset-0 pointer-events-none z-10" style={{ background: bindingShadow }} />
            <div className="absolute inset-0 p-8 filter blur-[2px] opacity-60 flex flex-col">
                <span className="absolute top-4 right-4 text-gray-400 font-serif text-xs">{pageNum}</span>
                <h3 className="font-serif text-xl font-bold text-gray-800 mb-4">{t('personalize.pageLabel', { num: pageNum })}</h3>
                <div className="mt-4 h-32 bg-gray-200/50 rounded-md"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-gray-100 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-bold text-gray-600">{t('personalize.locked')}</span>
                </div>
            </div>
            {!isFlipping && side === 'left' && (
                <div className="absolute top-1/2 left-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors"
                     onClick={(e) => { e.stopPropagation(); turnPage('prev'); }}>
                    <ChevronLeft className="h-8 w-8 text-gray-400" />
                </div>
            )}
            {!isFlipping && side === 'right' && (
                <div className="absolute top-1/2 right-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors"
                     onClick={(e) => { e.stopPropagation(); turnPage('next'); }}>
                    <ChevronRight className="h-8 w-8 text-gray-400" />
                </div>
            )}
        </div>
      );
  };

  const isFormValid = name.length > 0 && age.length > 0 && (photo !== null || !!photoAssetId);
  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf3] px-4 text-center text-sm font-medium text-gray-500">
        {isBookCatalogLoading ? t('common.loading') : t('common.unknown')}
      </div>
    );
  }

  const staticLeftIndex = (isFlipping && flipDirection === 'prev') ? currentSpread - 1 : currentSpread;
  const isLeftPageVisible = staticLeftIndex > 0;

  const faceStyle: React.CSSProperties = {
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      position: 'absolute',
      inset: 0,
      backgroundColor: 'white',
      transformStyle: 'preserve-3d'
  };
  const previewBookShadow = 'drop-shadow(10px 22px 36px rgba(0,0,0,0.16)) drop-shadow(4px 8px 14px rgba(0,0,0,0.08))';
  

  const renderProgressSteps = () => {
    // Premium Progress Bar
    const steps = [
        { num: 1, label: t('personalize.stepStory'), icon: Book },
        { num: 2, label: t('personalize.stepCustomize'), icon: Sparkles },
        { num: 3, label: t('personalize.stepPreview'), icon: Wand2 },
        { num: 4, label: t('personalize.stepOrder'), icon: Package },
    ];
    const fillPercent = Math.max(0, Math.min(100, (currentProgressIndex / (steps.length - 1)) * 100))

    return (
      <div className="max-w-2xl mx-auto mb-10 relative hidden md:block px-4">
          {/* Track Background - Adjusted left-9 right-9 to be fully covered by circles */}
          <div className="absolute top-1/2 left-9 right-9 h-1.5 bg-gray-100 -translate-y-1/2 rounded-full z-0 overflow-hidden shadow-inner">
             {/* Active Track Fill */}
             <motion.div 
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                initial={false}
                animate={{ width: `${fillPercent}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
             />
          </div>

          <div className="relative flex justify-between z-10 w-full">
               {steps.map((s) => {
                   // Logic: Step is considered "active" or "completed" based on current step
                        const stepIndex = s.num - 1
                        const isCompleted = currentProgressIndex > stepIndex
                        const isActive = currentProgressIndex === stepIndex


                   return (
                       <div key={s.num} className="flex flex-col items-center gap-3 cursor-default group">
                           <div className="relative">
                               {/* Pulse Effect for Active Step */}
                               {isActive && (
                                   <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping"></span>
                               )}
                               
                               <div 
                                    className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all duration-500 shadow-md ${
                                        isActive 
                                            ? 'bg-amber-500 border-amber-200 text-white scale-110' 
                                            : isCompleted 
                                                ? 'bg-orange-500 border-orange-200 text-white' 
                                                : 'bg-white border-gray-100 text-gray-300'
                                    }`}
                               >
                                   {isCompleted && !isActive ? <Check className="w-6 h-6" /> : <s.icon className="w-5 h-5" />}
                               </div>
                           </div>
                           
                           <span 
                                className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                                    isActive || isCompleted ? 'text-gray-800' : 'text-gray-400'
                                }`}
                           >
                               {s.label}
                           </span>
                       </div>
                   );
               })}
          </div>
      </div>
    );
  };

  const renderProductShowcase = () => {
      const includedItems = {
          digital: [
              t('personalize.included.digital1'),
              t('personalize.included.digital2'),
              t('personalize.included.digital3'),
              t('personalize.included.digital4'),
          ],
          basic: [
              t('personalize.included.basic1'),
              t('personalize.included.basic2'),
              t('personalize.included.basic3'),
              t('personalize.included.basic4'),
          ],
          premium: [
              t('personalize.included.premium1'),
              t('personalize.included.premium2'),
              t('personalize.included.premium3'),
              t('personalize.included.premium4'),
          ],
          supreme: [
              t('personalize.included.supreme1'),
              t('personalize.included.supreme2'),
              t('personalize.included.supreme3'),
              t('personalize.included.supreme4'),
          ],
      } as const

      const items = includedItems[bookType] ?? includedItems.digital

      return (
          <div className="mt-4 p-4 bg-amber-50/50 rounded-xl border border-amber-100">
              <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  {t('personalize.whatIncluded')}
              </h5>
              <ul className="space-y-2">
                  {items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                          <div className="min-w-[16px] pt-0.5">
                              <Check className="h-4 w-4 text-green-500" />
                          </div>
                          <span>{item}</span>
                      </li>
                  ))}
              </ul>
          </div>
      );
  };

  return (
    <div className="page-surface min-h-screen flex flex-col font-sans relative z-20">
      
      {/* Fly Animation Portal Effect */}
      <AnimatePresence>
          {showFlyAnimation && (
              <motion.div
                  initial={{ 
                      position: 'fixed', 
                      top: flyOrigin.y, 
                      left: flyOrigin.x, 
                      width: 50, 
                      height: 70, 
                      opacity: 1, 
                      zIndex: 100 
                  }}
                  animate={{ 
                      top: flyTarget.y,
                      left: flyTarget.x,
                      width: 20, 
                      height: 30, 
                      opacity: 0,
                      rotate: 360,
                      scale: 0.5
                  }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="rounded-md overflow-hidden shadow-2xl pointer-events-none border-2 border-white"
              >
                  <img src={book.coverUrl} className="w-full h-full object-cover" alt="" />
              </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreviewCancelledToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-5 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/80 bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(218,119,31,0.18)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <X className="h-4 w-4" />
              </div>
              <span>{t('personalize.previewCancelledToast')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-amber-100 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-amber-600 transition-colors">
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm font-medium">{t('common.back')}</span>
            </button>
            <div className="text-gray-900 font-serif font-bold text-lg hidden sm:block">
                {book.title}
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
                <LanguageSwitcher menuClassName="w-44 rounded-md border border-gray-100 bg-white shadow-lg py-1" />

                <Button ref={cartIconRef} variant="ghost" size="sm" onClick={() => router.push('/cart')} className="relative px-2">
                    <ShoppingCart className="h-5 w-5 text-gray-700" />
                    {cartCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                            {cartCount}
                        </span>
                    )}
                </Button>

                <div className="relative">
                    {user ? (
                    <div className="flex items-center">
                        <button onClick={() => setUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 focus:outline-none">
                            <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full border border-gray-200 object-cover" />
                        </button>
                        {isUserMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-gray-100 bg-white shadow-lg py-1 z-50">
                                <div className="px-4 py-2 border-b border-gray-50">
                                    <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                                </div>
                                <button onClick={() => { router.push('/orders'); setUserMenuOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><Package className="h-4 w-4" />{t('navbar.myOrders')}</button>
                                <button onClick={() => { logout(); setUserMenuOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />{t('navbar.logOut')}</button>
                            </div>
                        )}
                    </div>
                    ) : (
                        <Button onClick={() => openLoginModal()} size="sm">{t('navbar.logIn')}</Button>
                    )}
                </div>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative mx-auto w-full max-w-full flex-grow overflow-hidden px-4 py-6 md:container md:py-7">
        
        {renderProgressSteps()}

        <AnimatePresence mode="wait">
            
            {/* Step 1 (Skipped logic) */}


            {/* Step 2: The Rich Form */}
            {viewState.showForm && (
                <motion.div 
                    key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="mx-auto grid w-full min-w-0 max-w-[1320px] overflow-hidden gap-5 lg:grid-cols-12 lg:gap-7"
                >
                    <div className="order-1 min-w-0 space-y-4 md:space-y-5 lg:order-1 lg:col-span-6">
                        <div className="w-full min-w-0 overflow-hidden bg-white/50 backdrop-blur-md border border-white/82 p-3 sm:p-3.5 md:p-4 rounded-[1.1rem] shadow-[0_16px_30px_-28px_rgba(0,0,0,0.22)]">
                            <div className="mb-4 md:mb-5">
                                <div
                                  ref={showcaseRowRef}
                                  className="flex min-w-0 flex-col gap-2.5 md:grid md:items-start md:gap-3"
                                  style={isMobile ? undefined : { gridTemplateColumns: `${desktopThumbColumnWidth}px minmax(0, 1fr)` }}
                                >
                                    <div className="order-2 min-w-0 md:order-1 md:shrink-0">
                                        <div className="relative w-full max-w-full min-w-0 overflow-hidden md:overflow-visible">
                                        <div
                                          ref={showcaseThumbViewportRef}
                                          className="thumb-scroll-column flex w-full max-w-full min-w-0 gap-2 overflow-x-auto px-0 pb-1 md:w-auto md:max-w-none md:flex-col md:gap-2 md:overflow-y-auto md:overflow-x-hidden md:pr-[6px] md:pb-0"
                                          style={
                                            isMobile
                                              ? undefined
                                              : { width: `${desktopThumbColumnWidth}px`, height: `${desktopMainShowcaseSize}px` }
                                          }
                                        >
                                        {showcaseImages.map((image, index) => {
                                          const isActive = index === activeShowcaseIndex;

                                          return (
                                            <button
                                              key={`${image}-${index}`}
                                              ref={(node) => {
                                                showcaseThumbRefs.current[index] = node;
                                              }}
                                              type="button"
                                              onClick={() => setActiveShowcaseIndex(index)}
                                              className={`group relative aspect-square overflow-hidden rounded-[0.82rem] border transition-all duration-300 shrink-0 ${
                                                isActive
                                                  ? 'border-amber-300/95 bg-white/85 ring-2 ring-amber-200/55 shadow-[0_8px_18px_-18px_rgba(217,119,6,0.24)]'
                                                  : 'border-gray-200/60 bg-white/30 hover:border-amber-200/80'
                                              }`}
                                              style={
                                                isMobile
                                                  ? { width: '3.75rem', height: '3.75rem' }
                                                  : { width: `${desktopShowcaseThumbSize}px`, height: `${desktopShowcaseThumbSize}px` }
                                              }
                                              aria-label={`Show preview image ${index + 1}`}
                                            >
                                              <div className="aspect-square overflow-hidden rounded-[inherit]">
                                                <img
                                                  src={image}
                                                  alt={`${templateTitle || book.title} showcase ${index + 1}`}
                                                  loading="lazy"
                                                  decoding="async"
                                                  onError={(event) => {
                                                    const target = event.currentTarget;
                                                    if (resolvedBook?.coverUrl && target.src !== resolvedBook.coverUrl) {
                                                      target.src = resolvedBook.coverUrl;
                                                    }
                                                  }}
                                                  className={`h-full w-full object-cover transition-transform duration-500 ${isActive ? 'scale-[1.04]' : 'scale-100 group-hover:scale-[1.03]'}`}
                                                />
                                              </div>
                                            </button>
                                          );
                                        })}
                                        </div>
                                        {!isMobile ? (
                                          <>
                                            <div className="pointer-events-none absolute inset-x-0 top-0 h-5 rounded-t-[0.82rem] bg-gradient-to-b from-white/96 via-white/72 to-transparent" />
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 rounded-b-[0.82rem] bg-gradient-to-t from-white/96 via-white/72 to-transparent" />
                                          </>
                                        ) : null}
                                        </div>
                                    </div>

                                    <div className="order-1 md:order-2 min-w-0">
                                        <div
                                          ref={mainShowcaseRef}
                                          className="relative mx-auto aspect-square w-full max-w-[430px] overflow-hidden rounded-[0.96rem] bg-[#f6efe7] shadow-[0_16px_24px_-22px_rgba(0,0,0,0.18)] md:mx-0 md:max-w-none"
                                          style={isMobile ? undefined : { width: `${desktopMainShowcaseSize}px`, maxWidth: '100%' }}
                                        >
                                            <AnimatePresence mode="wait">
                                                <motion.img
                                                    key={activeShowcaseImage}
                                                    src={activeShowcaseImage}
                                                    alt={`${templateTitle || book.title} showcase main`}
                                                    loading="eager"
                                                    decoding="async"
                                                    onError={(event) => {
                                                      const target = event.currentTarget;
                                                      if (resolvedBook?.coverUrl && target.src !== resolvedBook.coverUrl) {
                                                        target.src = resolvedBook.coverUrl;
                                                      }
                                                    }}
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                    initial={{ opacity: 0, x: 18, scale: 1.02 }}
                                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                                    exit={{ opacity: 0, x: -18, scale: 0.985 }}
                                                    transition={{ duration: 0.42, ease: 'easeOut' }}
                                                />
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <h2 className="text-[1.42rem] sm:text-[1.52rem] md:text-[1.68rem] font-serif font-bold text-gray-900 mb-2">{templateTitle || book.title}</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-4 md:mb-5">{templateDescription || book.description}</p>
                            
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">{t('personalize.magicAttributes')}</h4>
                                <div className="flex items-center justify-between text-sm text-gray-700">
                                    <span className="flex items-center gap-2"><Heart className="h-4 w-4 text-pink-400" /> {t('personalize.kindness')}</span>
                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full"><div className="w-[90%] h-full bg-pink-400 rounded-full"></div></div>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-700">
                                    <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-blue-400" /> {t('personalize.courage')}</span>
                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full"><div className="w-[80%] h-full bg-blue-400 rounded-full"></div></div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/65 backdrop-blur-md border border-white/80 rounded-[0.96rem] shadow-[0_14px_24px_-24px_rgba(0,0,0,0.2)] p-3.5 md:p-4">
                            <button
                              type="button"
                              onClick={() => setMobileStoryInfoOpen((prev) => !prev)}
                              className="mb-0 flex w-full items-center justify-between gap-3 text-left md:mb-4 md:cursor-default"
                              aria-expanded={isMobileStoryInfoOpen}
                            >
                              <span className="flex items-center gap-2">
                                <CircleHelp className="h-5 w-5 text-amber-500" />
                                <span className="text-sm font-bold uppercase tracking-[0.18em] text-amber-600">
                                  About This Story
                                </span>
                              </span>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-amber-500 transition-transform duration-200 md:hidden ${
                                  isMobileStoryInfoOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

                            <div className={`${isMobileStoryInfoOpen ? 'mt-4 block' : 'hidden'} space-y-3 md:mt-0 md:block`}>
                                {bookFaqItems.map((item, index) => {
                                  const isOpen = expandedBookFaq === index;

                                  return (
                                    <div
                                      key={item.question}
                                      className="rounded-2xl border border-amber-100/80 bg-white/80 overflow-hidden"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setExpandedBookFaq((prev) => (prev === index ? null : index))}
                                        className="w-full flex items-start justify-between gap-3 px-4 py-4 text-left hover:bg-amber-50/60 transition-colors"
                                      >
                                        <span className="text-sm font-semibold text-gray-800 leading-6">{item.question}</span>
                                        <span className="mt-0.5 text-amber-500 shrink-0">
                                          <ChevronDown
                                            className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                                          />
                                        </span>
                                      </button>
                                      {isOpen ? (
                                        <div className="px-4 pb-4 text-sm leading-6 text-gray-600">
                                          {item.answer}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="order-2 min-w-0 lg:order-2 lg:col-span-6">
                        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-white/78 backdrop-blur-sm rounded-[1.14rem] p-3.5 sm:p-4 md:p-5 shadow-[0_18px_28px_-26px_rgba(0,0,0,0.18)] border border-amber-50/80">
                            <div className="mb-4 flex items-start justify-between gap-3 sm:items-center sm:mb-5">
                                <h3 className="text-[1.55rem] md:text-2xl font-serif font-bold text-gray-900 flex items-center gap-2">
                                    <Sparkles className="h-6 w-6 text-amber-500" /> {t('personalize.customize')}
                                </h3>
                                <div className="text-2xl font-bold text-amber-600">{formatLocaleCurrency(currentPrice, language)}</div>
                            </div>

                            <div className="space-y-4 md:space-y-6 flex-grow">
                                <div className="border-2 border-dashed border-amber-200 rounded-[1rem] p-3 sm:p-4 md:p-[18px] text-center bg-amber-50/60 hover:bg-amber-50 transition-colors relative group cursor-pointer">
                                    <input type="file" onChange={handlePhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer z-30" accept="image/*" />
                                    {photoPreview ? (
                                        <div className="relative z-10 pointer-events-none">
                                            <img src={photoPreview} alt={t('personalize.uploadChildPhoto')} className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full object-cover mx-auto border-4 border-white shadow-lg" />
                                            <p className="text-xs text-amber-600 mt-1.5 font-medium">{t('personalize.clickToChangePhoto')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 pointer-events-none">
                                            <motion.div
                                                className="relative w-18 h-18 sm:w-20 sm:h-20 mx-auto"
                                                animate={{ y: [0, -7, 0] }}
                                                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                                            >
                                                <span className="absolute inset-0 rounded-full bg-amber-300/45 blur-2xl animate-pulse-slow" />
                                                <span className="absolute inset-3 rounded-full bg-orange-200/50 blur-xl animate-pulse" />
                                                <div className="absolute inset-2 rounded-full border border-amber-300/60" />
                                                <div className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-white via-amber-50 to-amber-100 text-amber-600 shadow-[0_14px_34px_rgba(245,158,11,0.34)] ring-4 ring-white/80 sm:h-20 sm:w-20">
                                                    <Camera className="h-8 w-8 sm:h-9 sm:w-9" />
                                                </div>
                                            </motion.div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 text-base sm:text-lg">{t('personalize.uploadChildPhoto')}</h4>
                                                <p className="mt-0.5 text-xs font-medium text-amber-700">{t('personalize.uploadPhotoHint')}</p>
                                            </div>
                                            <div className="mx-auto w-full min-w-0 max-w-[320px] sm:max-w-[360px] md:max-w-[380px] rounded-[0.85rem] border border-amber-100/90 bg-white/74 p-2 sm:p-2.5 shadow-[0_10px_22px_rgba(245,158,11,0.08)]">
                                                <div className="grid min-w-0 grid-cols-3 gap-1">
                                                    {GOOD_PHOTO_EXAMPLES.map((item) => (
                                                        <div key={item.src} className="relative">
                                                            <div className="aspect-[7/5] overflow-hidden rounded-md sm:rounded-lg border border-emerald-100 bg-emerald-50 shadow-[0_5px_12px_rgba(16,185,129,0.08)]">
                                                                <img
                                                                    src={item.src}
                                                                    alt={item.alt}
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </div>
                                                            <div className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                                                                <Check className="h-2 w-2" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-1 grid min-w-0 grid-cols-3 gap-1">
                                                    {BAD_PHOTO_EXAMPLES.map((item) => (
                                                        <div key={item.src} className="relative">
                                                            <div className="aspect-[7/5] overflow-hidden rounded-md sm:rounded-lg border border-rose-100 bg-rose-50 shadow-[0_5px_12px_rgba(244,63,94,0.08)]">
                                                                <img
                                                                    src={item.src}
                                                                    alt={item.alt}
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </div>
                                                            <div className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
                                                                <X className="h-2 w-2" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-1.5 text-[9px] sm:text-[10px] leading-4 text-gray-500 text-left">
                                                    {t('personalize.photoTips')}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {recentFaces.length > 0 && (
                                  <div className="flex max-w-full flex-wrap gap-3 overflow-hidden">
                                    {recentFaces.map((face) => (
                                      <div key={face.asset_id} className="relative w-12 h-12">
                                        <button
                                          type="button"
                                          className="w-12 h-12 rounded-full overflow-hidden border border-white shadow-sm hover:ring-2 hover:ring-amber-300 transition"
                                          onClick={() => {
                                            if (!face.signed_url) return;
                                            setPhoto(null);
                                            setPhotoPreview(face.signed_url);
                                            setFaceImageUrl(face.signed_url);
                                            setPhotoAssetId(face.asset_id);
                                            setPhotoStoragePath(face.storage_path ?? null);
                                          }}
                                        >
                                          <img
                                            src={face.signed_url ?? ''}
                                            alt="Recent face"
                                            className="w-full h-full object-cover"
                                          />
                                        </button>
                                        <button
                                          type="button"
                                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-white text-gray-500 border border-gray-200 shadow hover:text-red-500 hover:border-red-200 transition flex items-center justify-center"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleDeleteFace(face.asset_id);
                                          }}
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                                    <div ref={nameBoxRef} className="space-y-2 relative">
                                        <label className="text-sm font-bold text-gray-700">{t('personalize.nameLabel')}</label>
                                        <input 
                                            type="text" 
                                            value={name} 
                                            onChange={(e) => setName(e.target.value)} 
                                            onFocus={() => {
                                              loadProfiles();
                                              setShowNameHistory(true);
                                              setShowAgeHistory(false);
                                              setShowLanguageOptions(false);
                                            }}
                                            placeholder={t('personalize.namePlaceholder')} 
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium" 
                                        />
                                        {showNameHistory && (
                                          <div
                                            className="absolute z-30 mt-2 w-full rounded-xl border border-amber-100 bg-white shadow-lg p-2 max-h-44 overflow-auto"
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                          >
                                            {Array.from(
                                              new Set(
                                                recentProfiles
                                                  .map((profile) => profile.metadata?.name ?? profile.metadata?.child_name)
                                                  .filter((value): value is string => Boolean(value))
                                                  .map((value) => String(value))
                                              )
                                            ).length === 0 ? (
                                              <div className="px-3 py-2 text-xs text-gray-400">{t('personalize.noHistory')}</div>
                                            ) : (
                                              Array.from(
                                                new Set(
                                                  recentProfiles
                                                    .map((profile) => profile.metadata?.name ?? profile.metadata?.child_name)
                                                    .filter((value): value is string => Boolean(value))
                                                    .map((value) => String(value))
                                                )
                                              ).map((value) => (
                                                  <div
                                                    key={value}
                                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-amber-50 transition"
                                                  >
                                                    <button
                                                      type="button"
                                                      className="flex-1 text-left text-sm text-gray-700"
                                                      onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        setName(value);
                                                        setShowNameHistory(false);
                                                      }}
                                                    >
                                                      {value}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="text-gray-400 hover:text-red-500 transition"
                                                      onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        handleDeleteProfile({ field: 'name', value });
                                                      }}
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                ))
                                            )}
                                          </div>
                                        )}
                                    </div>
                                    <div ref={ageBoxRef} className="space-y-2 relative">
                                        <label className="text-sm font-bold text-gray-700">{t('personalize.ageLabel')}</label>
                                        <input 
                                            type="number" 
                                            value={age} 
                                            onChange={(e) => setAge(e.target.value)} 
                                            onFocus={() => {
                                              loadProfiles();
                                              setShowAgeHistory(true);
                                              setShowNameHistory(false);
                                              setShowLanguageOptions(false);
                                            }}
                                            placeholder={t('personalize.agePlaceholder')} 
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium" 
                                        />
                                        {showAgeHistory && (
                                          <div
                                            className="absolute z-30 mt-2 w-full rounded-xl border border-amber-100 bg-white shadow-lg p-2 max-h-44 overflow-auto"
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                          >
                                            {Array.from(
                                              new Set(
                                                recentProfiles
                                                  .map((profile) => profile.metadata?.age ?? profile.metadata?.child_age)
                                                  .filter((value): value is number => value !== undefined && value !== null)
                                                  .map((value) => String(value))
                                              )
                                            ).length === 0 ? (
                                              <div className="px-3 py-2 text-xs text-gray-400">{t('personalize.noHistory')}</div>
                                            ) : (
                                              Array.from(
                                                new Set(
                                                  recentProfiles
                                                    .map((profile) => profile.metadata?.age ?? profile.metadata?.child_age)
                                                    .filter((value): value is number => value !== undefined && value !== null)
                                                    .map((value) => String(value))
                                                )
                                              ).map((value) => (
                                                  <div
                                                    key={value}
                                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-amber-50 transition"
                                                  >
                                                    <button
                                                      type="button"
                                                      className="flex-1 text-left text-sm text-gray-700"
                                                      onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        setAge(value);
                                                        setShowAgeHistory(false);
                                                      }}
                                                    >
                                                      {value}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="text-gray-400 hover:text-red-500 transition"
                                                      onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        handleDeleteProfile({ field: 'age', value });
                                                      }}
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                ))
                                            )}
                                          </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-gray-700">{t('personalize.storyLanguage')}</label>
                                    <div ref={languageBoxRef} className="relative">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowLanguageOptions((prev) => !prev);
                                            setShowNameHistory(false);
                                            setShowAgeHistory(false);
                                          }}
                                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-800 font-medium outline-none transition-all focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                                        >
                                          {selectedLang === 'English'
                                            ? t('personalize.storyLanguageEnglish')
                                            : selectedLang === 'Traditional Chinese'
                                            ? t('personalize.storyLanguageTraditionalChinese')
                                            : t('personalize.storyLanguageSpanish')}
                                        </button>
                                        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${showLanguageOptions ? 'rotate-180' : ''}`} />
                                        {showLanguageOptions && (
                                          <div
                                            className="absolute z-30 mt-2 w-full rounded-xl border border-amber-100 bg-white shadow-lg p-2 overflow-auto"
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                          >
                                            {[
                                              { value: 'English' as StoryLanguage, label: t('personalize.storyLanguageEnglish') },
                                              { value: 'Traditional Chinese' as StoryLanguage, label: t('personalize.storyLanguageTraditionalChinese') },
                                              { value: 'Spanish' as StoryLanguage, label: t('personalize.storyLanguageSpanish') },
                                            ].map((lang) => (
                                              <button
                                                key={lang.value}
                                                type="button"
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                                                  selectedLang === lang.value
                                                    ? 'bg-amber-50 text-amber-700 font-semibold'
                                                    : 'text-gray-700 hover:bg-amber-50'
                                                }`}
                                                onMouseDown={(event) => {
                                                  event.preventDefault();
                                                  setSelectedLang(lang.value);
                                                  setShowLanguageOptions(false);
                                                }}
                                              >
                                                {lang.label}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-gray-700">{t('personalize.bookType')}</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <button onClick={() => setBookType('digital')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'digital' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">{t('personalize.bookTypeDigitalTitle')}</div>
                                            <div className="text-xs text-gray-500">{t('personalize.bookTypeDigitalSubtitle')}</div>
                                        </button>
                                        <button onClick={() => setBookType('basic')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'basic' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">{t('personalize.bookTypeBasicTitle')}</div>
                                            <div className="text-xs text-gray-500">{t('personalize.bookTypeBasicSubtitle')}</div>
                                        </button>
                                        <button onClick={() => setBookType('supreme')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'supreme' ? 'border-gray-900 bg-gray-100' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">{t('personalize.bookTypeSupremeTitle')}</div>
                                            <div className="text-xs text-gray-500">{t('personalize.bookTypeSupremeSubtitle')}</div>
                                        </button>
                                    </div>
                                    {requiresVoiceSample ? (
                                      <div ref={voicePanelRef}>
                                        <VoiceRecorderPanel
                                          customerId={user?.customerId}
                                          existingAssetId={voiceAssetId}
                                          existingStoragePath={voiceStoragePath}
                                          existingSignedUrl={resolvedVoiceSignedUrl}
                                          validationError={voiceValidationError}
                                          onUploadComplete={handleVoiceUploadComplete}
                                          onClearValidation={() => setVoiceValidationError(null)}
                                        />
                                      </div>
                                    ) : null}
                                    {renderProductShowcase()}
                                </div>
                            </div>

                            <div className="pt-8 mt-4 border-t border-gray-100">
                                <button 
                                    onClick={fsm.primaryAction} 
                                    disabled={!isFormValid || isSupreme} 
                                    className={`w-full h-16 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all duration-500 shadow-xl ${(!isFormValid || isSupreme) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:scale-[1.02] shadow-amber-200'}`}
                                >
                                    {isSupreme ? t('personalize.comingSoon') : <><Sparkles className="h-6 w-6" /> {isFormValid ? t('personalize.generateMagicPreview') : t('personalize.completeDetails')}</>}
                                </button>
                                {previewError && (
                                  <p className="text-xs text-red-500 mt-2">{previewError}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Step 3: Preview */}
            {viewState.showPreview && (
                <motion.div 
                    key="step3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[600px] py-6 md:py-10"
                >
                    <div className="text-center mb-6 md:mb-10 text-gray-800">
                        <h2 className="text-2xl md:text-3xl font-serif font-bold mb-2">{t('personalize.previewTitle', { name })}</h2>
                        <p className="text-gray-600 text-sm md:text-base">{t('personalize.previewSubtitle')}</p>
                    </div>

                    <div 
                        className="relative mb-7 md:mb-12 flex select-none justify-center perspective-2000" 
                        style={{ height: previewStageHeight }}
                    >
                         {/* Responsive Scaler Wrapper */}
                         <div
                            className="shrink-0"
                            style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', width: PAGE_WIDTH * 2 }}
                         >
                            <motion.div 
                                className="relative w-full flex justify-center" 
                                animate={{ x: (currentSpread === 0 && !isFlipping) ? -190 : 0 }} 
                                transition={{ duration: ANIMATION_DURATION, ease: "easeInOut" }} 
                                style={{ transformStyle: 'preserve-3d', perspective: '2500px', height: PREVIEW_HEIGHT, filter: previewBookShadow }}
                            >
                                 
                                 {/* 3D Book Thickness (LEFT = Center Binding) */}
                                 {/* Center Spine position */}
                                 <div 
                                    className="absolute top-0 bottom-0 left-[calc(50%-25px)] w-[50px] z-[-1]"
                                    style={centerBindingPattern}
                                 />

                                 {/* 3D Book Thickness (LEFT = Cover Edge - Thin) */}
                                 <div 
                                    className="absolute top-0 bottom-0 left-[calc(50%-380px)] w-[12px] z-[-1]"
                                    style={{
                                        background: '#f1f1f1', 
                                        boxShadow: 'inset -2px 0 5px rgba(0,0,0,0.1)',
                                        transform: `translateZ(-5px) translateX(-6px)`,
                                        borderRadius: '4px 0 0 4px',
                                        opacity: isLeftPageVisible ? 1 : 0
                                    }}
                                 />
                                 
                                 {/* Right Stack (Pages) */}
                                 <div 
                                    className="absolute top-2 bottom-2 w-[12px] z-[-1]"
                                    style={{
                                        ...pageStackPattern,
                                        left: 'calc(50% + 375px)', // Attached to right edge
                                        transform: 'translateZ(-2px)',
                                        borderRadius: '0 2px 2px 0'
                                    }}
                                 />
                                 
                                 {/* Hardcover Back Edge */}
                                 <div 
                                    className="absolute top-0 bottom-0 w-[4px] z-[-2]"
                                    style={{
                                        background: '#9ca3af',
                                        boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.3), 1px 0 2px rgba(0,0,0,0.2)',
                                        left: 'calc(50% + 382px)',
                                        transform: 'translateZ(-4px)',
                                        borderRadius: '0 4px 4px 0'
                                    }}
                                 />

                                 {/* Static Pages Layer */}
                                 <div className="absolute top-0 w-full h-full flex justify-center">
                                    <div className={`relative h-full ${isLeftPageVisible ? 'opacity-100' : 'opacity-0'}`} style={{ width: PAGE_WIDTH }}>
                                        {renderPageContent('left', staticLeftIndex)}
                                    </div>
                                    <div className="relative h-full" style={{ width: PAGE_WIDTH }}>
                                        {(isFlipping && flipDirection === 'next') ? renderPageContent('right', currentSpread + 1) : renderPageContent('right', currentSpread)}
                                    </div>
                                </div>

                                {/* Active Flipping Layer */}
                                <AnimatePresence>
                                    {isFlipping && flipDirection === 'next' && (
                                        <motion.div 
                                            initial={{ rotateY: 0 }} 
                                            animate={{ rotateY: -180 }} 
                                            transition={{ duration: ANIMATION_DURATION, ease: "easeInOut" }} 
                                            style={{ width: PAGE_WIDTH, height: '100%', position: 'absolute', top: 0, left: '50%', transformOrigin: 'left center', transformStyle: 'preserve-3d', zIndex: 50 }}
                                        >
                                            {/* Front of the flipping page (Right Side content moving Left) */}
                                            <div className="backface-hidden" style={faceStyle}>
                                                {renderPageContent('right', currentSpread)}
                                                {/* Soft Light Overlay: Darkens heavily as it stands up (90deg), then lightens */}
                                                <motion.div 
                                                    className="absolute inset-0 z-50 pointer-events-none"
                                                    initial={{ opacity: 0, background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                                                    animate={{ opacity: [0, 0.6, 0] }}
                                                    transition={{ duration: ANIMATION_DURATION, times: [0, 0.5, 1] }}
                                                />
                                            </div>
                                            
                                            {/* Back of the flipping page (Next Left Side content) */}
                                            <div className="backface-hidden" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
                                                {renderPageContent('left', currentSpread + 1)}
                                                {/* Soft Light Overlay for the back side */}
                                                <motion.div 
                                                    className="absolute inset-0 z-50 pointer-events-none"
                                                    initial={{ opacity: 0, background: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                                                    animate={{ opacity: [0, 0.6, 0] }}
                                                    transition={{ duration: ANIMATION_DURATION, times: [0, 0.5, 1] }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                    
                                    {isFlipping && flipDirection === 'prev' && (
                                        <motion.div 
                                            initial={{ rotateY: -180 }} 
                                            animate={{ rotateY: 0 }} 
                                            transition={{ duration: ANIMATION_DURATION, ease: "easeInOut" }} 
                                            style={{ width: PAGE_WIDTH, height: '100%', position: 'absolute', top: 0, left: '50%', transformOrigin: 'left center', transformStyle: 'preserve-3d', zIndex: 50 }}
                                        >
                                            {/* Front of flipping page (Left Side content moving Right) */}
                                            <div className="backface-hidden" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
                                                {renderPageContent('left', currentSpread)}
                                                 {/* Soft Light Overlay */}
                                                 <motion.div 
                                                    className="absolute inset-0 z-50 pointer-events-none"
                                                    initial={{ opacity: 0, background: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                                                    animate={{ opacity: [0, 0.6, 0] }}
                                                    transition={{ duration: ANIMATION_DURATION }}
                                                />
                                            </div>

                                            {/* Back of flipping page (Prev Right Side content) */}
                                            <div className="backface-hidden" style={faceStyle}>
                                                {renderPageContent('right', currentSpread - 1)}
                                                {/* Soft Light Overlay */}
                                                <motion.div 
                                                    className="absolute inset-0 z-50 pointer-events-none"
                                                    initial={{ opacity: 0, background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                                                    animate={{ opacity: [0, 0.6, 0] }}
                                                    transition={{ duration: ANIMATION_DURATION }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>
                    </div>

                    <div className="w-full max-w-3xl px-2">
                      <label className="mx-auto mb-3 flex max-w-2xl cursor-pointer items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-left shadow-sm backdrop-blur-sm">
                        <input
                          type="checkbox"
                          checked={isCheckoutAcknowledged}
                          onChange={(event) => {
                            setIsCheckoutAcknowledged(event.target.checked);
                            if (event.target.checked) {
                              setCheckoutAcknowledgementError(false);
                            }
                          }}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-600 accent-amber-500 focus:ring-2 focus:ring-amber-300"
                        />
                        <span className="text-xs font-medium leading-relaxed text-amber-950/80 sm:text-sm">
                          {t('personalize.checkoutAcknowledgement')}
                        </span>
                      </label>
                      {checkoutAcknowledgementError ? (
                        <p className="mb-3 text-center text-xs font-semibold text-red-500">
                          {t('personalize.checkoutAcknowledgementRequired')}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex w-full max-w-md flex-col justify-center gap-3 px-2 sm:max-w-none sm:flex-row sm:gap-4 md:gap-5">
                        <Button
                            onClick={handleOpenPreviewShare}
                            size="lg"
                            variant="secondary"
                            className="glass-action-btn glass-action-btn--neutral relative z-20 h-11 w-full rounded-full px-5 text-sm font-semibold sm:w-auto sm:px-7 md:h-12 md:px-8 md:text-base"
                            disabled={isPreparingShare || !creationId}
                        >
                            <Share2 className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                            {isPreparingShare ? t('common.loading') : t('share.previewButton')}
                        </Button>
                         <Button
                            ref={addToCartBtnRef}
                            onClick={handleAddToCartClick}
                            size="lg"
                            variant="outline"
                            className="glass-action-btn glass-action-btn--amber relative z-20 h-11 w-full rounded-full px-5 text-sm font-semibold sm:w-auto sm:px-7 md:h-12 md:px-8 md:text-base"
                         >
                            <ShoppingCart className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                            {t('personalize.addToCartPrice', { price: formatLocaleCurrency(currentPrice, language) })}
                        </Button>
                        <Button
                            onClick={handleCheckoutClick}
                            size="lg"
                            disabled={!isCheckoutAcknowledged}
                            className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-6 text-sm font-semibold sm:w-auto sm:px-9 md:h-12 md:px-10 md:text-base"
                        >
                            {t('personalize.checkoutNow')}
                        </Button>
                    </div>
                    {shareError ? <p className="mt-3 text-center text-xs text-red-500">{shareError}</p> : null}
                </motion.div>
            )}
        </AnimatePresence>

        <ShareDialog
          open={isShareDialogOpen && Boolean(previewShareUrl)}
          onClose={() => setIsShareDialogOpen(false)}
          title={t('share.previewTitle')}
          description={t('share.previewDescription')}
          shareUrl={previewShareUrl || ''}
          shareText={t('share.previewTemplate')}
          previewImageUrl={previewShareImageUrl}
          note={t('share.previewNote')}
        />

        {/* Loading Overlay */}
        <AnimatePresence>
            {viewState.showLoading && (
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-8 bg-gradient-to-br from-amber-50/95 via-white/95 to-orange-50/95 backdrop-blur-xl overflow-hidden"
                >
                    {/* Floating Decorative Elements (Absolute Corners - No Overlap) */}
                    <motion.div animate={{ y: [0, -20, 0], rotate: [0, 10, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="absolute top-10 left-10 opacity-30 pointer-events-none">
                        <BookOpen className="w-24 h-24 text-amber-500" />
                    </motion.div>
                    <motion.div animate={{ y: [0, 30, 0], rotate: [0, -15, 15, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }} className="absolute bottom-10 right-10 opacity-30 pointer-events-none">
                        <Wand2 className="w-20 h-20 text-purple-500" />
                    </motion.div>
                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-20 right-20 pointer-events-none">
                        <Star className="w-16 h-16 text-yellow-400 fill-yellow-400" />
                    </motion.div>

                    {/* Central Loading Content */}
                    <div className="max-w-2xl w-full text-center space-y-8 relative z-10 flex flex-col items-center">
                        <div className="relative inline-block mb-4">
                             <div className="absolute inset-0 bg-amber-200 blur-2xl opacity-40 animate-pulse"></div>
                             <Sparkles className="h-16 w-16 text-amber-500 animate-spin-slow relative z-10" />
                        </div>
                        
                        <div>
                            <motion.h3 
                                key={loadingText} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="text-3xl font-serif font-bold text-gray-900 mb-2"
                            >
                                {loadingText}
                            </motion.h3>
                            <p className="text-gray-500 text-sm font-mono">
                              {loadingCountdownSeconds > 0
                                ? t('personalize.estimatedWait', { seconds: loadingCountdownSeconds })
                                : t('personalize.almostThere')}
                            </p>
                        </div>
                        
                        {/* Progress Bar Container */}
                        <div className="w-full max-w-2xl mx-auto">
                             <div className="w-full max-w-lg mx-auto bg-gray-200 rounded-full h-2 overflow-hidden relative shadow-inner mb-6">
                                <motion.div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" style={{ width: `${progress}%` }} />
                                <motion.div 
                                    className="absolute top-0 bottom-0 w-20 bg-white/30 skew-x-[-20deg]" 
                                    animate={{ x: ['-100%', '500%'] }} 
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} 
                                />
                            </div>

                            {/* Mini Game — play while waiting */}
                            <div className="flex justify-center">
                              <MiniGame />
                            </div>

                             {/* Tip text below video */}
                             <motion.p 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                                className="text-amber-900 text-sm font-medium flex items-center justify-center gap-2 mt-4"
                             >
                                 <Info className="h-4 w-4 text-amber-500" /> 
                                 <span>{t('personalize.didYouKnow')}</span>
                             </motion.p>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 text-center">
                  <BookOpen className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{t('personalize.exitConfirmTitle')}</h3>
                  <p className="text-gray-600 mb-6">{t('personalize.exitConfirmBody')}</p>
                  <div className="flex gap-3 justify-center">
                      <Button variant="outline" onClick={dismissExitConfirm}>{t('personalize.exitConfirmStay')}</Button>
                      <Button variant="primary" onClick={returnToCustomizeFromPreview}>{t('personalize.exitConfirmBack')}</Button>
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
};


