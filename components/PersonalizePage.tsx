'use client'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersonalizeFlow } from '@/components/personalize/usePersonalizeFlow';
import { usePersonalizeState } from '@/components/personalize/usePersonalizeState';
import { autoCropFaceImage, faceQualityCheck, prepareFaceImage, uploadUserAsset, validateFaceImage, type FaceImageValidationResult, type PendingUserAssetUpload } from '@/services/assets';
import {
  cancelPreviewJob,
  commitPreviewVariant,
  createPreviewJob,
  createPreviewVariant,
  discardPreviewVariant,
  discardPreviewVariantSession,
  getJob,
  getPreviewPages,
  PreviewVariantRequestError,
} from '@/services/jobs';
import { supabase } from '@/lib/supabase';
import { usePersonalizeStage } from '@/components/personalize/usePersonalizeStage';
import { isUuid } from '@/lib/validators';
import { useI18n } from '@/lib/useI18n';
import { formatDisplayCurrency } from '@/lib/locale-pricing';
import { isBrowserTranslated } from '@/lib/browser-translation';
import { buildPreviewCartHref } from '@/lib/cart-navigation';
import { PREVIEW_VARIANT_SESSION_CAP } from '@/lib/preview-variants';
import { PreviewActionBar } from '@/components/personalize/PreviewActionBar';
import { GeneratePreviewAction } from '@/components/personalize/GeneratePreviewAction';
import { ProductShowcaseCarousel } from '@/components/personalize/ProductShowcaseCarousel';
import type { PersonalizeBookType } from '@/components/personalize/BookPackageSelector';
import { StoryInfoPanel } from '@/components/personalize/StoryInfoPanel';
import type { RecentFaceItem } from '@/components/personalize/RecentFacesStrip';
import { ProgressSteps } from '@/components/personalize/ProgressSteps';
import { PersonalizeHeader } from '@/components/personalize/PersonalizeHeader';
import { PersonalizeOverlays } from '@/components/personalize/PersonalizeOverlays';
import { LoadingPreviewOverlay } from '@/components/personalize/LoadingPreviewOverlay';
import { PreviewIntroHeader } from '@/components/personalize/PreviewIntroHeader';
import { PreviewShareDialog } from '@/components/personalize/PreviewShareDialog';
import { PreviewBookStage } from '@/components/personalize/PreviewBookStage';
import { PreviewBookPageContent } from '@/components/personalize/PreviewBookPageContent';
import { CustomizeFormCard } from '@/components/personalize/CustomizeFormCard';
import { StoryShowcaseCard } from '@/components/personalize/StoryShowcaseCard';
import { CustomizeFormLayout } from '@/components/personalize/CustomizeFormLayout';
import { PreviewStepLayout } from '@/components/personalize/PreviewStepLayout';
import { PreviewVariantGallery } from '@/components/personalize/PreviewVariantGallery';
import { CustomizeFormFields } from '@/components/personalize/CustomizeFormFields';
import { useBookCatalog } from '@/components/useBookCatalog';
import type { CatalogBook } from '@/lib/book-catalog';
import type { CartItem, StoryLanguage } from '@/types';

type FacePrepareStatus = 'idle' | 'checking' | 'preparing' | 'ready' | 'failed';

type FacePreparationOutcome =
  | { status: 'ready'; file: File; autoCropped: boolean }
  | { status: 'failed'; error: FaceImageValidationResult | null }
  | { status: 'cancelled' };

type PreviewVariantView = {
  jobId: string
  status: 'generating' | 'ready' | 'failed'
  pages: string[]
  coverUrl: string | null
  photoPreviewUrl: string | null
  faceAssetId: string | null
  faceStoragePath: string | null
  faceImageUrl: string | null
  original: boolean
  countsTowardLimit: boolean
}

const logPreviewDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_PREVIEW_DEBUG === 'true') {
    console.info('[preview-job]', ...args);
  }
};

const createGenerateTimer = () => {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return (label: string, details?: Record<string, unknown>) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    logPreviewDebug(label, {
      elapsed_ms: Math.round(now - startedAt),
      ...(details ?? {}),
    });
  };
};

const normalizeStoryLanguage = (value: unknown): StoryLanguage => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'simplified chinese' || raw === 'chinese simplified' || raw === 'cn_s' || raw === 'zh-cn' || raw === 'simplified') {
    return 'Simplified Chinese';
  }
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese';
  }
  if (raw === 'spanish' || raw === 'es') {
    return 'Spanish';
  }
  return 'English';
};

const normalizePersonalizeBookType = (value: unknown): PersonalizeBookType => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'digital' || raw === 'ebook') return 'digital';
  if (raw === 'premium' || raw === 'audio') return 'premium';
  if (raw === 'supreme') return 'supreme';
  return 'basic';
};

const getBookMinimumAge = (book?: Pick<CatalogBook, 'ageGroup'> | null) => (
  book?.ageGroup === 'ages_6_plus' ? 6 : 2
);

const AUTO_FACE_CROP_TIMEOUT_MS = 2500;
const AUTO_CROP_FIXABLE_CODES = new Set(['faceTooSmall', 'faceNotCentered']);

type TimedResult<T> =
  | { status: 'done'; value: T }
  | { status: 'timeout' };

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<TimedResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TimedResult<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });

  return Promise.race([
    work.then((value): TimedResult<T> => ({ status: 'done', value })),
    timeout,
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function waitForImageDecode(url: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error('Preview cover timed out')), timeoutMs);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().catch(() => undefined).finally(() => finish());
      } else {
        finish();
      }
    };
    image.onerror = () => finish(new Error('Preview cover failed to load'));
    image.src = url;
  });
}

const parseChildAge = (value: string) => {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const previewVariantSessionStorageKey = (creationId: string) =>
  `ymi_preview_variant_sessions_${creationId}`;

function readPreviewVariantSessionIds(creationId: string) {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(previewVariantSessionStorageKey(creationId)) || '[]'
    );
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((value): value is string => isUuid(value))))
      : [];
  } catch {
    return [];
  }
}

function writePreviewVariantSessionIds(creationId: string, sessionIds: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const key = previewVariantSessionStorageKey(creationId);
    const uniqueIds = Array.from(new Set(sessionIds.filter(isUuid)));
    if (uniqueIds.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, JSON.stringify(uniqueIds));
  } catch {
    // The in-memory session still supports cleanup when storage is unavailable.
  }
}

function rememberPreviewVariantSession(creationId: string, sessionId: string) {
  writePreviewVariantSessionIds(creationId, [
    ...readPreviewVariantSessionIds(creationId),
    sessionId,
  ]);
}

function forgetPreviewVariantSession(creationId: string, sessionId: string) {
  writePreviewVariantSessionIds(
    creationId,
    readPreviewVariantSessionIds(creationId).filter((value) => value !== sessionId)
  );
}

export default function PersonalizePage({ bookID }: { bookID: string }) {

  const fsm = usePersonalizeStage()
  const { t } = useI18n()

  const { user, openLoginModal, logout, addToCart, removeFromCart, updateCartQuantity, prepareCheckout, resumeData, resumePersonalization, displayCurrency, cart, isHydrated } = useGlobalContext();
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const { books: catalogBooks, isLoading: isBookCatalogLoading } = useBookCatalog();
  const [templateDetailBook, setTemplateDetailBook] = useState<CatalogBook | null>(null);
  const catalogBook = catalogBooks.find(b => b.bookID === bookID);
  const book = templateDetailBook ?? (isBookCatalogLoading ? undefined : catalogBook);
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
    exitPhase,
    finishGenerating,
    beginExitExecution,
    exitIntent,
    completeExit,
    failExit,
    reset,
    restore,
    startForm,
    isExiting,
    viewState,
    uiProgress,
    canAddToCart,
    canCheckout,
    canBack,
    backIntent,
    requestCheckout,
    primaryAction,
    } = fsm;

  //??鞈?Steps
  const PROGRESS_MAP = {
    STORY: 0,
    CUSTOMIZE: 1,
    PREVIEW: 2,
  } as const

  const currentProgressIndex = PROGRESS_MAP[uiProgress]

  // --- Animation States ---
  const [showFlyAnimation, setShowFlyAnimation] = useState(false);
  const [flyAnimationId, setFlyAnimationId] = useState(0);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null); 
  const [flyOrigin, setFlyOrigin] = useState({ x: 0, y: 0 });
  const [flyTarget, setFlyTarget] = useState({ x: 0, y: 0 });
  const flyAnimationTimerRef = useRef<number | null>(null);
  const addToCartPromiseRef = useRef<Promise<CartItem | null> | null>(null);
  const lastAddToCartItemRef = useRef<CartItem | null>(null);
  const exitRunningRef = useRef(false);
  const [pageToastMessage, setPageToastMessage] = useState<string | null>(null);
  const pageToastTimerRef = useRef<number | null>(null);
  const previewCancelRequestedRef = useRef(false);
  const [loadingCountdownSeconds, setLoadingCountdownSeconds] = useState(65);
  const [facePrepareStatus, setFacePrepareStatus] = useState<FacePrepareStatus>('idle');
  const [preparedFaceFile, setPreparedFaceFile] = useState<File | null>(null);
  const [facePrepareError, setFacePrepareError] = useState<string | null>(null);
  const [faceAutoCropped, setFaceAutoCropped] = useState(false);
  const facePrepareRunIdRef = useRef(0);
  const localPhotoPreviewUrlRef = useRef<string | null>(null);
  const photoRef = useRef<File | null>(photo);
  const photoAssetIdRef = useRef<string | null>(photoAssetId);
  const preparedFaceFileRef = useRef<File | null>(preparedFaceFile);
  const facePrepareStatusRef = useRef<FacePrepareStatus>(facePrepareStatus);
  const facePrepareErrorRef = useRef<string | null>(facePrepareError);
  const dataGenerationConsentRef = useRef(false);
  const marketingConsentRef = useRef(false);

  useEffect(() => {
    photoRef.current = photo;
    photoAssetIdRef.current = photoAssetId;
    preparedFaceFileRef.current = preparedFaceFile;
    facePrepareStatusRef.current = facePrepareStatus;
    facePrepareErrorRef.current = facePrepareError;
  }, [photo, photoAssetId, preparedFaceFile, facePrepareStatus, facePrepareError]);

  const showLocalPhotoPreview = useCallback((file: File) => {
    const nextUrl = URL.createObjectURL(file);
    const previousUrl = localPhotoPreviewUrlRef.current;
    localPhotoPreviewUrlRef.current = nextUrl;
    setPhotoPreview(nextUrl);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
  }, [setPhotoPreview]);

  useEffect(() => () => {
    if (localPhotoPreviewUrlRef.current) {
      URL.revokeObjectURL(localPhotoPreviewUrlRef.current);
    }
  }, []);

  const resolveFaceValidationError = useCallback((result: FaceImageValidationResult) => {
    return result.code
      ? t(`personalize.faceValidation.${result.code}`)
      : result.message ?? t('personalize.photoPrepareFailed');
  }, [t]);



  // --- Flipbook Engine State ---
  const TOTAL_SPREADS = 15;
  const PAGE_WIDTH = 380; 
  const PAGE_HEIGHT = 380; // Square page for preview model
  const PREVIEW_PAGE_HEIGHT = PAGE_HEIGHT;
  const PREVIEW_HEIGHT = PAGE_HEIGHT + 40;
  const ANIMATION_DURATION = 0.8; 
  
  const [currentSpread, setCurrentSpread] = useState(0); 
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAgeRangeConfirm, setShowAgeRangeConfirm] = useState(false);
  const [showAddToCartConfirm, setShowAddToCartConfirm] = useState(false);
  const pendingGenerateConsentRef = useRef<{ dataGeneration: boolean; marketing: boolean } | null>(null);
  const [voiceAssetId, setVoiceAssetId] = useState<string | null>(null);
  const [voiceStoragePath, setVoiceStoragePath] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [selectedPreviewJobId, setSelectedPreviewJobId] = useState<string | null>(null);
  const selectedPreviewCreationIdRef = useRef<string | null>(null);
  const previewVariantSessionIdRef = useRef<string | null>(null);
  const previewVariantCleanupInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const [previewVariants, setPreviewVariants] = useState<PreviewVariantView[]>([]);
  const previewVariantsRef = useRef<PreviewVariantView[]>([]);
  const [previewVariantSessionCount, setPreviewVariantSessionCount] = useState(0);
  const [previewVariantPrepareStatus, setPreviewVariantPrepareStatus] = useState<FacePrepareStatus>('idle');
  const [previewVariantError, setPreviewVariantError] = useState<string | null>(null);
  const [discardingPreviewVariantIds, setDiscardingPreviewVariantIds] = useState<Set<string>>(() => new Set());
  const [isPreviewPhotoLocked, setIsPreviewPhotoLocked] = useState(false);
  const previewVariantGenerationRef = useRef(false);
  const previewVariantPhotoUrlsRef = useRef<Set<string>>(new Set());
  const [creationId, setCreationId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewImageErrors, setPreviewImageErrors] = useState<Set<string>>(() => new Set());
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [previewShareUrl, setPreviewShareUrl] = useState<string | null>(null);
  const [previewPublicShareImageUrl, setPreviewPublicShareImageUrl] = useState<string | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);
  const previewActionInFlightRef = useRef<'CHECKOUT' | null>(null);
  const [previewActionPending, setPreviewActionPending] = useState<'CHECKOUT' | null>(null);
  const checkoutInFlightRef = useRef(false);
  const preloadedPreviewImagesRef = useRef<Set<string>>(new Set());
  const previewRefreshInFlightRef = useRef(false);
  const lastPreviewRefreshAtRef = useRef(0);
  const [templateCoverUrl, setTemplateCoverUrl] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateDescription, setTemplateDescription] = useState<string | null>(null);
  const [templateInnerDescription, setTemplateInnerDescription] = useState<string | null>(null);
  const [recentFaces, setRecentFaces] = useState<RecentFaceItem[]>([]);
  const [recentVoices, setRecentVoices] = useState<Array<{ asset_id: string; storage_path?: string | null; signed_url?: string | null; metadata?: { duration_seconds?: number | null } }>>([]);
  const [voiceSignedUrl, setVoiceSignedUrl] = useState<string | null>(null);
  const [voiceValidationError, setVoiceValidationError] = useState<string | null>(null);
  type RecentProfileItem = {
    asset_id: string
    metadata?: { child_name?: string; child_age?: number; name?: string; age?: number; gender?: string }
  }

  useEffect(() => {
    previewVariantsRef.current = previewVariants;
  }, [previewVariants]);

  useEffect(() => {
    if (!creationId || !previewJobId) {
      if (!creationId) {
        selectedPreviewCreationIdRef.current = null;
        setSelectedPreviewJobId(null);
        previewVariantSessionIdRef.current = null;
        setPreviewVariants([]);
        setPreviewVariantSessionCount(0);
        setPreviewVariantError(null);
        setIsPreviewPhotoLocked(false);
      }
      return;
    }

    if (selectedPreviewCreationIdRef.current !== creationId) {
      selectedPreviewCreationIdRef.current = creationId;
      setSelectedPreviewJobId(previewJobId);
      setPreviewVariants([
        {
          jobId: previewJobId,
          status: previewPages[0] || previewUrl ? 'ready' : 'generating',
          pages: previewPages,
          coverUrl: previewPages[0] || previewUrl,
          photoPreviewUrl: photoPreview,
          faceAssetId: photoAssetId,
          faceStoragePath: photoStoragePath,
          faceImageUrl,
          original: true,
          countsTowardLimit: false,
        },
      ]);
      setPreviewVariantSessionCount(0);
      setPreviewVariantError(null);
      setIsPreviewPhotoLocked(false);
    }
  }, [creationId, previewJobId, previewPages, previewUrl, photoPreview, photoAssetId, photoStoragePath, faceImageUrl]);

  useEffect(() => {
    if (!selectedPreviewJobId) return;
    setPreviewVariants((current) =>
      current.map((variant) =>
        variant.jobId === selectedPreviewJobId
          ? {
              ...variant,
              status: previewPages[0] || previewUrl ? 'ready' : variant.status,
              pages: previewPages,
              coverUrl: previewPages[0] || previewUrl || variant.coverUrl,
              photoPreviewUrl: photoPreview || variant.photoPreviewUrl,
              faceAssetId: photoAssetId || variant.faceAssetId,
              faceStoragePath: photoStoragePath || variant.faceStoragePath,
              faceImageUrl: faceImageUrl || variant.faceImageUrl,
            }
          : variant
      )
    );
  }, [selectedPreviewJobId, previewPages, previewUrl, photoPreview, photoAssetId, photoStoragePath, faceImageUrl]);

  useEffect(() => {
    const photoUrls = previewVariantPhotoUrlsRef.current;
    return () => {
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
      photoUrls.clear();
    };
  }, []);

  const applyPreviewVariantSelection = useCallback((variant: PreviewVariantView) => {
    if (variant.status !== 'ready' || !variant.coverUrl) return;
    setSelectedPreviewJobId(variant.jobId);
    setPreviewPages(variant.pages.length ? variant.pages : [variant.coverUrl]);
    setPreviewUrl(variant.coverUrl);
    setPreviewImageErrors(() => new Set());
    setCurrentSpread(0);
    setIsFlipping(false);
    setFlipDirection(null);
    setPhoto(null);
    setPreparedFaceFile(null);
    setFacePrepareStatus('ready');
    setFacePrepareError(null);
    setFaceAutoCropped(false);
    setPhotoPreview(variant.photoPreviewUrl);
    setPhotoAssetId(variant.faceAssetId);
    setPhotoStoragePath(variant.faceStoragePath);
    setFaceImageUrl(variant.faceImageUrl);
  }, [setFaceImageUrl, setPhoto, setPhotoAssetId, setPhotoPreview, setPhotoStoragePath]);

  const handleSelectPreviewVariant = useCallback((jobId: string) => {
    const variant = previewVariantsRef.current.find((item) => item.jobId === jobId);
    if (variant) applyPreviewVariantSelection(variant);
  }, [applyPreviewVariantSelection]);

  const cleanupPreviewVariantSession = useCallback((
    sessionId: string,
    options?: { keepalive?: boolean }
  ) => {
    if (!creationId || !isUuid(sessionId)) return Promise.resolve(true);
    const cleanupKey = `${creationId}:${sessionId}`;
    const existing = previewVariantCleanupInFlightRef.current.get(cleanupKey);
    if (existing) return existing;

    const cleanup = discardPreviewVariantSession({
      creationId,
      variantSessionId: sessionId,
      keepalive: options?.keepalive,
    })
      .then(() => {
        forgetPreviewVariantSession(creationId, sessionId);
        return true;
      })
      .catch((error) => {
        console.error('Preview variant session cleanup failed', error);
        return false;
      })
      .finally(() => {
        previewVariantCleanupInFlightRef.current.delete(cleanupKey);
      });

    previewVariantCleanupInFlightRef.current.set(cleanupKey, cleanup);
    return cleanup;
  }, [creationId]);

  const ensurePreviewVariantSession = useCallback(() => {
    if (!creationId) throw new Error('Preview creation is unavailable');
    const current = previewVariantSessionIdRef.current;
    if (current) return current;

    const sessionId = window.crypto.randomUUID();
    previewVariantSessionIdRef.current = sessionId;
    rememberPreviewVariantSession(creationId, sessionId);
    return sessionId;
  }, [creationId]);

  const resetPreviewVariantGallery = useCallback(() => {
    const committed = previewVariantsRef.current.find((variant) => variant.original);
    if (committed) {
      applyPreviewVariantSelection(committed);
      setPreviewVariants([{ ...committed, countsTowardLimit: false }]);
    }
    setPreviewVariantSessionCount(0);
    setPreviewVariantError(null);
    previewVariantGenerationRef.current = false;
  }, [applyPreviewVariantSelection]);

  const cleanupCurrentPreviewVariantSession = useCallback(async (options?: {
    keepalive?: boolean
    resetGallery?: boolean
  }) => {
    const sessionId = previewVariantSessionIdRef.current;
    if (!sessionId) return true;
    if (options?.resetGallery) resetPreviewVariantGallery();
    const cleaned = await cleanupPreviewVariantSession(sessionId, options);
    if (cleaned && previewVariantSessionIdRef.current === sessionId) {
      previewVariantSessionIdRef.current = null;
    }
    return cleaned;
  }, [cleanupPreviewVariantSession, resetPreviewVariantGallery]);

  useEffect(() => {
    if (viewMode !== 'preview' || !creationId) return;
    const staleSessionIds = readPreviewVariantSessionIds(creationId).filter(
      (sessionId) => sessionId !== previewVariantSessionIdRef.current
    );
    staleSessionIds.forEach((sessionId) => {
      void cleanupPreviewVariantSession(sessionId);
    });
  }, [cleanupPreviewVariantSession, creationId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'preview' || !creationId) return;

    const handlePageHide = () => {
      void cleanupCurrentPreviewVariantSession({ keepalive: true });
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !previewVariantSessionIdRef.current) return;
      void cleanupCurrentPreviewVariantSession({ resetGallery: true });
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      void cleanupCurrentPreviewVariantSession({ keepalive: true });
    };
  }, [cleanupCurrentPreviewVariantSession, creationId, viewMode]);

  const displayedPreviewJobId = selectedPreviewJobId ?? previewJobId;
  const isPreviewVariantBusy =
    previewVariantPrepareStatus === 'checking' ||
    previewVariantPrepareStatus === 'preparing' ||
    previewVariants.some((variant) => variant.status === 'generating');
  const isPreviewVariantLimitReached =
    previewVariantSessionCount >= PREVIEW_VARIANT_SESSION_CAP;

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
      setPreviewPublicShareImageUrl(data.imageUrl || null);
      setIsShareDialogOpen(true);
    } catch {
      setShareError(t('share.previewCreateFailed'));
    } finally {
      setIsPreparingShare(false);
    }
  }, [creationId, t, user?.customerId]);
  const [recentProfiles, setRecentProfiles] = useState<RecentProfileItem[]>([]);
  const voicePanelRef = useRef<HTMLDivElement | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef(name);
  const ageRef = useRef(age);
  const [areChildDetailsReady, setAreChildDetailsReady] = useState(false);
  const [childDetailsSeedVersion, setChildDetailsSeedVersion] = useState(0);
  const minimumRecommendedAge = getBookMinimumAge(book);
  const ageRangeWarningText = t('personalize.ageRangeInlineWarning', {
    minAge: minimumRecommendedAge,
    ageRange: book?.ageLabel ?? `${minimumRecommendedAge}+`,
  });
  // --- Mobile Responsive State ---
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const resolvedBook = useMemo(() => {
    if (!book) return null;
    return {
      ...book,
      title: templateTitle ?? book.title,
      coverUrl: templateCoverUrl ?? book.coverUrl,
      description: templateDescription ?? book.description,
      innerDescription: templateInnerDescription ?? book.innerDescription,
    };
  }, [book, templateTitle, templateCoverUrl, templateDescription, templateInnerDescription]);

  useEffect(() => {
    nameRef.current = name;
    ageRef.current = age;
    setAreChildDetailsReady((prev) => {
      const next = name.trim().length > 0 && age.trim().length > 0;
      return prev === next ? prev : next;
    });
    setChildDetailsSeedVersion((prev) => prev + 1);
  }, [name, age]);

  const handleChildDetailsChange = useCallback((details: { name: string; age: string }) => {
    nameRef.current = details.name;
    ageRef.current = details.age;
    setShowAgeRangeConfirm(false);
    setAreChildDetailsReady((prev) => {
      const next = details.name.trim().length > 0 && details.age.trim().length > 0;
      return prev === next ? prev : next;
    });
  }, []);

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
  const previewShareImageUrl = previewPublicShareImageUrl || previewPages[0] || previewUrl || resolvedBook?.coverUrl || null;
  const staticPreviewSecondPageUrl = useMemo(() => {
    if (!bookID) return '';
    const { data } = supabase.storage.from('app-templates').getPublicUrl(`${bookID}/preview_2.png`);
    return data?.publicUrl || '';
  }, [bookID]);
  const finalPreviewImages = useMemo(
    () => (Array.isArray(resolvedBook?.finalPreviewImages) ? resolvedBook.finalPreviewImages.filter(Boolean) : []),
    [resolvedBook],
  );
  const magicAttributes = useMemo(
    () => (Array.isArray(resolvedBook?.magicAttributes) ? resolvedBook.magicAttributes.filter((attribute) => attribute.label.trim()) : []),
    [resolvedBook],
  );
  const maxSpreadIndex = Math.max(
    finalPreviewImages.length || TOTAL_SPREADS,
    Math.max(0, previewPages.length - 1),
  );
  const currentVoiceSample = useMemo(() => {
    if (!voiceAssetId) return null;
    return recentVoices.find((voice) => voice.asset_id === voiceAssetId) ?? null;
  }, [recentVoices, voiceAssetId]);

  const resolvedVoiceSignedUrl = voiceSignedUrl || currentVoiceSample?.signed_url || null;
  const markPreviewImageError = useCallback((image: string) => {
    if (!image) return;
    setPreviewImageErrors((prev) => {
      if (prev.has(image)) return prev;
      const next = new Set(prev);
      next.add(image);
      return next;
    });
  }, []);
  const refreshPreviewImages = useCallback(async (
    reason: 'visibility' | 'pageshow' | 'focus' | 'image-error',
    options?: { force?: boolean }
  ) => {
    if (!viewState.showPreview) return;
    if (!displayedPreviewJobId) return;
    if (previewRefreshInFlightRef.current) return;

    const now = Date.now();
    const shouldThrottle = options?.force !== true;
    if (shouldThrottle && now - lastPreviewRefreshAtRef.current < 30_000) {
      return;
    }

    previewRefreshInFlightRef.current = true;
    try {
      const urls = await getPreviewPages(displayedPreviewJobId, undefined, {
        size: 'small',
        customerId: user?.customerId ?? null,
      });
      if (!urls[0]) return;

      setPreviewPages(urls);
      setPreviewUrl(urls[0]);
      setPreviewImageErrors(() => new Set());
      lastPreviewRefreshAtRef.current = Date.now();
      logPreviewDebug('preview images refreshed', { reason, jobId: displayedPreviewJobId, count: urls.length });
    } catch {
      // Keep the controlled fallback UI. The next focus/visibility change or image error can retry.
    } finally {
      previewRefreshInFlightRef.current = false;
    }
  }, [displayedPreviewJobId, user?.customerId, viewState.showPreview]);
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
    if (!viewState.showLoading) {
      setLoadingCountdownSeconds(65);
      return;
    }

    setLoadingCountdownSeconds(65);

    const interval = window.setInterval(() => {
      setLoadingCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [viewState.showLoading]);

  // Visual state used by the book animation shell.
  const isClosing = isFlipping && flipDirection === 'prev' && currentSpread === 1;
  const isVisualBookOpen = currentSpread > 0 || (isFlipping && flipDirection === 'next' && currentSpread === 0);
  const isBookClosed = !isVisualBookOpen;
  // Keep the flow initialized only once per mounted personalize session.
  const didInitFSM = useRef(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (didInitFSM.current) return
    if (!bookID) return

    if (resumeData && resumeData.bookID === bookID) {
        restore({
        hasDraft: !!resumeData.personalization,
        savedStage: viewMode === 'preview' ? 'PREVIEW' : 'FORM',
        })
    } else if (viewMode === 'preview' && (creationIdParam || previewJobIdParam)) {
        restore({
        hasDraft: true,
        savedStage: 'PREVIEW',
        })
    } else {
        startForm()
    }

    didInitFSM.current = true
  }, [bookID, resumeData, restore, startForm, viewMode, creationIdParam, previewJobIdParam])



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
    setFaceAutoCropped(false)
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
        const urls = await getPreviewPages(previewJobId, undefined, { size: 'small', customerId: user?.customerId ?? null })
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
  }, [viewMode, previewJobId, user?.customerId])

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
                if (nextType) setBookType(normalizePersonalizeBookType(nextType))

                if (!templateTitle && creation.templates?.name) {
                  setTemplateTitle(creation.templates.name)
                }
                if (!templateDescription && creation.templates?.description) {
                  setTemplateDescription(creation.templates.description)
                }
                if (!templateInnerDescription && creation.templates?.inner_description) {
                  setTemplateInnerDescription(creation.templates.inner_description)
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
        const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!isActive) return
        const creation = data?.creation
        if (!creation) return

        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ creation }))
        }

        const activePreviewJobId = String(creation.preview_job_id || '')
        if (
          isUuid(activePreviewJobId) &&
          activePreviewJobId !== previewJobId &&
          !previewVariantSessionIdRef.current
        ) {
          selectedPreviewCreationIdRef.current = null
          setPreviewVariants([])
          setSelectedPreviewJobId(activePreviewJobId)
          setPreviewJobId(activePreviewJobId)
          setPreviewPages([])
          setPreviewUrl(null)
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.removeItem(`ymi_preview_${creationId}`)
            } catch {
              // Continue URL reconciliation when session storage is unavailable.
            }
            const params = new URLSearchParams(window.location.search)
            params.set('view', 'preview')
            params.set('creationId', creationId)
            params.set('jobId', activePreviewJobId)
            window.history.replaceState(
              window.history.state,
              '',
              `/personalize/${bookID}?${params.toString()}`
            )
          }
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
        if (nextType) setBookType(normalizePersonalizeBookType(nextType))

        if (!templateTitle && creation.templates?.name) {
          setTemplateTitle(creation.templates.name)
        }
        if (!templateDescription && creation.templates?.description) {
          setTemplateDescription(creation.templates.description)
        }
        if (!templateInnerDescription && creation.templates?.inner_description) {
          setTemplateInnerDescription(creation.templates.inner_description)
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
  }, [viewMode, creationId, user?.customerId, previewJobId, name, age, selectedLang, bookType, templateTitle, templateDescription, templateInnerDescription, templateCoverUrl, setName, setAge, setSelectedLang, setBookType, setTemplateTitle, setTemplateDescription, setTemplateInnerDescription, setTemplateCoverUrl, bookID])

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
    setPreparedFaceFile(null)
    setFacePrepareStatus('idle')
    setFacePrepareError(null)
    setFaceAutoCropped(false)
    facePrepareRunIdRef.current += 1
    setTemplateCoverUrl(null)
    setTemplateTitle(null)
    setTemplateDescription(null)
    setTemplateInnerDescription(null)
    setTemplateDetailBook(null)
    setRecentFaces([])
    setVoiceAssetId(null)
    setVoiceStoragePath(null)
    setVoiceSignedUrl(null)
    setVoiceValidationError(null)
    setPreviewJobId(null)
    setCreationId(null)
    setPreviewUrl(null)
    setPreviewPages([])
  }, [bookID, resumeData, viewMode, creationIdParam, creationId, previewJobIdParam, previewJobId, stage, setName, setAge, setSelectedLang, setBookType, setPhoto, setPhotoPreview, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setVoiceAssetId, setVoiceStoragePath, setPreviewJobId, setCreationId, setPreviewUrl, setTemplateCoverUrl, setTemplateTitle, setTemplateDescription, setTemplateInnerDescription])

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
    const loadPreviewCoverAsset = async (jobId: string) => {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const urls = await getPreviewPages(jobId, [0], {
            size: 'small',
            customerId: user?.customerId ?? null,
          });
          logPreviewDebug('preview cover url count', { jobId, count: urls.length, attempt });
          if (urls[0]) {
            return {
              urls: [urls[0]],
              primaryUrl: urls[0],
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
      throw new Error('Preview cover is still processing. Please refresh.');
    };
    const loadAllReadyPreviewAssets = async (jobId: string) => {
      try {
        const urls = await getPreviewPages(jobId, undefined, {
          size: 'small',
          customerId: user?.customerId ?? null,
        });
        if (urls[0]) {
          return {
            urls,
            primaryUrl: urls[0],
          };
        }
      } catch {
        // Fall back to the required cover asset below.
      }
      return loadPreviewCoverAsset(jobId);
    };
    const loadPartialPreviewCoverAsset = async (jobId: string) => {
      try {
        const urls = await getPreviewPages(jobId, [0], {
          size: 'small',
          customerId: user?.customerId ?? null,
        });
        logPreviewDebug('preview cover url count', { jobId, count: urls.length, mode: 'partial' });
        if (urls[0]) {
          return {
            urls: [urls[0]],
            primaryUrl: urls[0],
          };
        }
      } catch {
        // Preview cover is not ready yet.
      }
      return null;
    };

    setPreviewError(null);
    setProgress(0);

    const messages = [
      t('personalize.printingMagic'),
      t('personalize.creatingStorybook'),
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
        const markGenerateTiming = createGenerateTimer()
        markGenerateTiming('generate_clicked')
        const currentCustomerId = user?.customerId ?? null
        const currentPhoto = photoRef.current
        let faceAssetId = photoAssetIdRef.current
        let pendingFaceAsset: PendingUserAssetUpload | undefined
        const currentPreparedFaceFile = preparedFaceFileRef.current
        const currentFacePrepareStatus = facePrepareStatusRef.current
        const currentFacePrepareError = facePrepareErrorRef.current
        const hasDataGenerationConsent = dataGenerationConsentRef.current
        const hasMarketingConsent = marketingConsentRef.current
        const currentName = nameRef.current
        const currentAge = ageRef.current

        if (!book) throw new Error('Book not found')
        if (!currentPhoto && !faceAssetId) throw new Error('Please upload a photo before generating the preview')
        if (!hasDataGenerationConsent) throw new Error(t('personalize.dataConsentRequired'))

        setPreviewUrl(null)
        setPreviewPages([])

        if (!faceAssetId) {
          if (currentFacePrepareStatus === 'checking' || currentFacePrepareStatus === 'preparing') {
            throw new Error(t('personalize.photoPreparing'))
          }
          if (currentFacePrepareStatus === 'failed') {
            throw new Error(currentFacePrepareError ?? t('personalize.photoPrepareFailed'))
          }
          const uploadFile = currentPreparedFaceFile ?? currentPhoto
          if (!uploadFile) {
            throw new Error('Missing face asset for preview')
          }
          const faceAsset = await uploadUserAsset(uploadFile, 'face_image', 'face', currentCustomerId ?? undefined, {
            skipFacePreparation: Boolean(currentPreparedFaceFile),
            originalName: currentPhoto?.name ?? uploadFile.name,
            deferConfirm: true,
            onTiming: markGenerateTiming,
          })
          if (!isActive) return
          if (!('bucket' in faceAsset)) {
            throw new Error('Pending face upload missing upload metadata')
          }
          pendingFaceAsset = faceAsset
          faceAssetId = faceAsset.asset_id
        }

        const parsedAge = Number.parseInt(currentAge, 10)
        const textOverrides = {
          child_name: currentName,
          child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
          dedication: '',
          language: selectedLang,
          book_type: bookType,
        }

        if (!currentCustomerId && currentName && currentAge) {
          fetch('/api/user/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              child_name: currentName,
              child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
              customerId: null,
            }),
            credentials: 'include',
          }).catch(() => {})
        } else if (currentCustomerId && currentName && currentAge) {
          fetch('/api/user/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              child_name: currentName,
              child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
              customerId: currentCustomerId,
            }),
            credentials: 'include',
          }).catch(() => {})
        }

        if (!faceAssetId) {
          throw new Error('Missing face asset for preview')
        }

        const consentRecordedAt = new Date().toISOString()
        const generationConsentParams = {
          consent: {
            content_generation: {
              accepted: true,
              accepted_at: consentRecordedAt,
              version: 'content-generation-consent-v1',
            },
            marketing: {
              accepted: hasMarketingConsent,
              accepted_at: hasMarketingConsent ? consentRecordedAt : null,
              version: 'marketing-consent-v1',
            },
          },
        }

        const created = await createPreviewJob(
          book.bookID,
          faceAssetId,
          textOverrides,
          generationConsentParams,
          currentCustomerId ?? undefined,
          pendingFaceAsset
        )
        markGenerateTiming(pendingFaceAsset ? 'asset_confirmed/job_created' : 'job_created', {
          jobId: created?.jobId,
          creationId: created?.creationId,
          usedPendingAsset: Boolean(pendingFaceAsset),
        })
        if (!created?.jobId) {
          throw new Error('Preview job missing jobId')
        }
        if (pendingFaceAsset) {
          photoAssetIdRef.current = pendingFaceAsset.asset_id
          setPhotoAssetId(pendingFaceAsset.asset_id)
          setPhotoStoragePath(pendingFaceAsset.storage_path)
        }
        if (previewCancelRequestedRef.current) {
          try {
            await cancelPreviewJob(created.jobId, {
              creationId: created.creationId,
              customerId: currentCustomerId,
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
        let lastLoggedJobState = ''
        while (isActive) {
          let job
          try {
            job = await getJob(created.jobId, currentCustomerId)
            fetchFailures = 0
            const loggedJobState = `${job.status}:${job.progress ?? ''}`
            if (loggedJobState !== lastLoggedJobState) {
              lastLoggedJobState = loggedJobState
              logPreviewDebug('job status', {
                jobId: created.jobId,
                status: job.status,
                progress: job.progress ?? null,
              })
              markGenerateTiming('first_job_status', {
                jobId: created.jobId,
                status: job.status,
                progress: job.progress ?? null,
              })
            }
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
              const previewAssets = await loadAllReadyPreviewAssets(created.jobId)
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
            logPreviewDebug('finishGenerating', { jobId: created.jobId, mode: 'done' })
            finishGenerating()
            return
          }

          if (job.status === 'running' && !partialPreviewShown) {
            const partialPreviewAssets = await loadPartialPreviewCoverAsset(created.jobId)
            if (partialPreviewAssets?.urls.length) {
              partialPreviewShown = true
              if (!isActive) return
              setPreviewPages(partialPreviewAssets.urls)
              if (partialPreviewAssets.primaryUrl) {
                setPreviewUrl(partialPreviewAssets.primaryUrl)
              }
              replacePreviewUrl(created.creationId, created.jobId)
              setProgress(100)
              markGenerateTiming('partial_preview_ready', {
                jobId: created.jobId,
                pages: partialPreviewAssets.urls.length,
              })
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
      } catch (error: unknown) {
        if (!isActive) return
        if (previewCancelRequestedRef.current) {
          return
        }
        const message = error instanceof Error ? error.message : 'Preview generation failed.'
        setPreviewError(message)
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
  // State setters from usePersonalizeState are stable; keeping them out avoids dev-time dependency shape churn during preview generation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selectedLang, finishGenerating, setProgress, setLoadingText, book, user?.customerId, reset, replacePreviewUrl, t, bookType]);

  useEffect(() => {
    if (!viewState.showPreview) return;
    if (!displayedPreviewJobId) return;
    if (previewPages.length >= 2) return;

    let isActive = true;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const pollForRemainingPreviewPages = async () => {
      while (isActive) {
        try {
          const urls = await getPreviewPages(displayedPreviewJobId, undefined, {
            size: 'small',
            customerId: user?.customerId ?? null,
          });
          if (!isActive) return;
          if (urls.length > previewPages.length) {
            setPreviewPages(urls);
            if (urls[0]) {
              setPreviewUrl(urls[0]);
            }
          }

          const job = await getJob(displayedPreviewJobId, user?.customerId ?? null);
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
  }, [viewState.showPreview, displayedPreviewJobId, previewPages.length, user?.customerId]);

  useEffect(() => {
    if (!viewState.showPreview) return;
    if (!displayedPreviewJobId) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshPreviewImages('visibility');
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refreshPreviewImages('pageshow', { force: true });
      }
    };
    const handleFocus = () => {
      void refreshPreviewImages('focus');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, [displayedPreviewJobId, refreshPreviewImages, viewState.showPreview]);

  useEffect(() => {
    if (!bookID) return;

    let isActive = true;

    const loadTemplateInfo = async () => {
      const response = await fetch(`/api/templates/${encodeURIComponent(bookID)}`, {
        credentials: 'omit',
      });
      const data = await response.json().catch(() => ({}));

      if (!isActive || !response.ok || !data?.template) return;

      const template = data.template as CatalogBook;
      setTemplateDetailBook(template);
      setTemplateCoverUrl(template.coverUrl || null);
      setTemplateTitle(template.title || null);
      setTemplateDescription(template.description || null);
      setTemplateInnerDescription(template.innerDescription || null);
    };

    loadTemplateInfo();

    return () => {
      isActive = false;
    };
  }, [bookID]);

  const loadUserAssets = useCallback(async (options?: { signal?: AbortSignal }) => {
    const params = user?.customerId ? `?customerId=${user.customerId}` : '';
    const response = await fetch(`/api/user-assets${params}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: options?.signal,
    });
    if (!response.ok) return;
    const data = await response.json();
    const faces = Array.isArray(data?.faces) ? data.faces : [];
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    setRecentFaces(faces);
    setRecentVoices(voices);
    setRecentProfiles(profiles);
  }, [user?.customerId]);

  useEffect(() => {
    if (!viewState.showForm) return;

    const controller = new AbortController();
    loadUserAssets({ signal: controller.signal }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.warn('Failed to load user assets:', error);
    });

    return () => {
      controller.abort();
    };
  }, [loadUserAssets, viewState.showForm]);

  useEffect(() => {
    setRecentFaces([]);
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

  const preloadPreviewImage = useCallback((url?: string | null) => {
    if (!url || typeof window === 'undefined') return;
    if (preloadedPreviewImagesRef.current.has(url)) return;

    preloadedPreviewImagesRef.current.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = url;
    void img.decode?.().catch(() => {
      // The visible image still owns error handling and signed-url refresh.
    });
  }, []);

  const resolvePreviewSpreadImage = useCallback((spreadIndex: number) => {
    if (spreadIndex <= 0) return previewPages[0] || '';
    if (spreadIndex === 1) return previewPages[1] || staticPreviewSecondPageUrl || '';
    return previewPages[spreadIndex] || finalPreviewImages[spreadIndex - 1] || '';
  }, [finalPreviewImages, previewPages, staticPreviewSecondPageUrl]);

  useEffect(() => {
    if (!viewState.showPreview) return;

    const immediateIndexes = new Set([
      0,
      Math.max(0, currentSpread - 1),
      currentSpread,
      currentSpread + 1,
      currentSpread + 2,
    ]);
    const immediateUrls = new Set<string>();

    immediateIndexes.forEach((spreadIndex) => {
      const url = resolvePreviewSpreadImage(spreadIndex);
      if (!url) return;
      immediateUrls.add(url);
      preloadPreviewImage(url);
    });

    const allPreviewUrls = [
      ...previewPages,
      staticPreviewSecondPageUrl,
      ...finalPreviewImages,
    ].filter(Boolean);

    const backgroundPreloadId = window.setTimeout(() => {
      allPreviewUrls.forEach((url) => {
        if (!url || immediateUrls.has(url)) return;
        preloadPreviewImage(url);
      });
    }, 500);

    return () => window.clearTimeout(backgroundPreloadId);
  }, [
    currentSpread,
    finalPreviewImages,
    preloadPreviewImage,
    previewPages,
    resolvePreviewSpreadImage,
    staticPreviewSecondPageUrl,
    viewState.showPreview,
  ]);

  // --- Handlers ---
  const handleDeleteFace = useCallback(async (assetId: string) => {
    setRecentFaces((prev) => prev.filter((face) => face.asset_id !== assetId));
    if (photoAssetId === assetId) {
      setPhotoAssetId(null);
      setPhotoStoragePath(null);
      setFaceImageUrl(null);
      setPhotoPreview(null);
      setPhoto(null);
      setPreparedFaceFile(null);
      setFacePrepareStatus('idle');
      setFacePrepareError(null);
      setFaceAutoCropped(false);
      facePrepareRunIdRef.current += 1;
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
    } catch {
      // no-op
    }
  }, [user?.customerId, photoAssetId, setPhoto, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setPhotoPreview]);

  const handleSelectRecentFace = useCallback((face: RecentFaceItem) => {
    if (!face.signed_url) return;

    facePrepareRunIdRef.current += 1;
    setPhoto(null);
    setPreparedFaceFile(null);
    setFacePrepareStatus('ready');
    setFacePrepareError(null);
    setFaceAutoCropped(false);
    setPhotoPreview(face.signed_url);
    setFaceImageUrl(face.signed_url);
    setPhotoAssetId(face.asset_id);
    setPhotoStoragePath(face.storage_path ?? null);
  }, [setFaceImageUrl, setPhoto, setPhotoAssetId, setPhotoPreview, setPhotoStoragePath]);

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
    } catch {
      // no-op
    }
  }, [user?.customerId]);

  const handleBack = () => {
    if (!canBack) return

    switch (backIntent) {
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

    if (flyAnimationTimerRef.current !== null) {
      window.clearTimeout(flyAnimationTimerRef.current);
    }

    setFlyOrigin({
      x: originRect ? originRect.left + originRect.width / 2 - 25 : window.innerWidth / 2 - 25,
      y: originRect ? originRect.top + originRect.height / 2 - 35 : window.innerHeight - 140,
    });

    setFlyTarget({
      x: targetRect ? targetRect.left + targetRect.width / 2 - 10 : window.innerWidth - 54,
      y: targetRect ? targetRect.top + targetRect.height / 2 - 10 : 22,
    });

    setFlyAnimationId((value) => value + 1);
    setShowFlyAnimation(true);
    flyAnimationTimerRef.current = window.setTimeout(() => {
      setShowFlyAnimation(false);
      flyAnimationTimerRef.current = null;
    }, 800);
  }, []);

  useEffect(() => {
    return () => {
      if (flyAnimationTimerRef.current !== null) {
        window.clearTimeout(flyAnimationTimerRef.current);
      }
    };
  }, []);

  const triggerPageToast = useCallback((message: string) => {
    setPageToastMessage(message);
    if (pageToastTimerRef.current) {
      window.clearTimeout(pageToastTimerRef.current);
    }
    pageToastTimerRef.current = window.setTimeout(() => {
      setPageToastMessage(null);
      pageToastTimerRef.current = null;
    }, 2200);
  }, []);

  const triggerPreviewCancelledToast = useCallback(() => {
    triggerPageToast(t('personalize.previewCancelledToast'));
  }, [t, triggerPageToast]);

  const triggerAddToCartFailedToast = useCallback(() => {
    triggerPageToast(t('personalize.addToCartFailedToast'));
  }, [t, triggerPageToast]);

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
      startForm();

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
      persistDraftForCustomizeReturn,
      previewJobId,
      setCreationId,
      setPreviewJobId,
      setPreviewPages,
      setPreviewUrl,
      setProgress,
      triggerPreviewCancelledToast,
      user?.customerId,
      startForm,
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

  const returnToCustomizeFromPreview = useCallback(async () => {
    persistDraftForCustomizeReturn();
    setShowExitConfirm(false);
    await cleanupCurrentPreviewVariantSession();
    router.replace(`/personalize/${bookID}`);
    startForm();
  }, [bookID, cleanupCurrentPreviewVariantSession, persistDraftForCustomizeReturn, router, startForm]);

  const navigateAwayFromPreview = useCallback(async (href: string) => {
    if (viewState.showPreview) {
      await cleanupCurrentPreviewVariantSession();
    }
    if (isBrowserTranslated()) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  }, [cleanupCurrentPreviewVariantSession, router, viewState.showPreview]);

  const logoutFromPreview = useCallback(async () => {
    if (viewState.showPreview) {
      await cleanupCurrentPreviewVariantSession();
    }
    logout();
  }, [cleanupCurrentPreviewVariantSession, logout, viewState.showPreview]);

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
      void returnToCustomizeFromPreview();
    } else {
      voicePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  }, [requiresVoiceSample, stage, voiceAssetId, returnToCustomizeFromPreview, t]);

  const handleVoiceUploadComplete = useCallback(
    ({ assetId, storagePath, signedUrl }: { assetId: string; storagePath: string; signedUrl?: string | null }) => {
      setVoiceAssetId(assetId);
      setVoiceStoragePath(storagePath);
      setVoiceSignedUrl(signedUrl ?? null);
      setVoiceValidationError(null);
    },
    []
  );

  const handleDiscardPreviewVariant = useCallback(async (jobId: string) => {
    const variant = previewVariantsRef.current.find((item) => item.jobId === jobId);
    const variantSessionId = previewVariantSessionIdRef.current;
    if (!variant || variant.original || !creationId || !variantSessionId) return;

    setDiscardingPreviewVariantIds((current) => new Set(current).add(jobId));
    setPreviewVariantError(null);
    try {
      await discardPreviewVariant({ creationId, jobId, variantSessionId });

      if (selectedPreviewJobId === jobId) {
        const fallback = previewVariantsRef.current.find(
          (item) => item.jobId !== jobId && item.original && item.status === 'ready'
        ) ?? previewVariantsRef.current.find(
          (item) => item.jobId !== jobId && item.status === 'ready'
        );
        if (fallback) applyPreviewVariantSelection(fallback);
      }

      setPreviewVariants((current) => current.filter((item) => item.jobId !== jobId));
      if (variant.countsTowardLimit) {
        setPreviewVariantSessionCount((count) => Math.max(0, count - 1));
      }
      if (variant.photoPreviewUrl && previewVariantPhotoUrlsRef.current.has(variant.photoPreviewUrl)) {
        previewVariantPhotoUrlsRef.current.delete(variant.photoPreviewUrl);
        URL.revokeObjectURL(variant.photoPreviewUrl);
      }
    } catch (error) {
      if (error instanceof PreviewVariantRequestError) {
        if (error.code === 'committed_preview' || error.code === 'creation_photo_locked') {
          setIsPreviewPhotoLocked(true);
        }
      }
      setPreviewVariantError(
        error instanceof Error ? error.message : t('personalize.previewVariantDiscardFailed')
      );
    } finally {
      setDiscardingPreviewVariantIds((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  }, [applyPreviewVariantSelection, creationId, selectedPreviewJobId, t]);

  const commitSelectedPreviewForExit = useCallback(async (ensuredCreationId: string) => {
    const expectedPreviewJobId = previewJobId;
    const selectedJobId = selectedPreviewJobId ?? expectedPreviewJobId;
    if (!expectedPreviewJobId || !selectedJobId) {
      throw new Error('Preview selection is unavailable');
    }

    const variantSessionId = previewVariantSessionIdRef.current;
    const result = await commitPreviewVariant({
      creationId: ensuredCreationId,
      expectedPreviewJobId,
      selectedPreviewJobId: selectedJobId,
      variantSessionId,
    });

    setPreviewJobId(result.activePreviewJobId);
    setSelectedPreviewJobId(result.activePreviewJobId);
    setIsPreviewPhotoLocked(true);
    setPreviewVariantSessionCount(0);
    const selectedVariant = previewVariantsRef.current.find(
      (variant) => variant.jobId === result.activePreviewJobId
    );
    previewVariantsRef.current.forEach((variant) => {
      if (
        variant.jobId !== result.activePreviewJobId &&
        variant.photoPreviewUrl &&
        previewVariantPhotoUrlsRef.current.has(variant.photoPreviewUrl)
      ) {
        previewVariantPhotoUrlsRef.current.delete(variant.photoPreviewUrl);
        URL.revokeObjectURL(variant.photoPreviewUrl);
      }
    });
    if (selectedVariant) {
      setPreviewVariants([
        { ...selectedVariant, original: true, countsTowardLimit: false },
      ]);
    }

    if (variantSessionId) {
      forgetPreviewVariantSession(ensuredCreationId, variantSessionId);
      previewVariantSessionIdRef.current = null;
    }
    setPreviewShareUrl(null);
    setPreviewPublicShareImageUrl(null);
    setIsShareDialogOpen(false);
    setShareError(null);
    replacePreviewUrl(ensuredCreationId, result.activePreviewJobId);

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`ymi_creation_${ensuredCreationId}`);
        window.sessionStorage.setItem(
          `ymi_preview_${ensuredCreationId}`,
          JSON.stringify({
            coverUrl: selectedVariant?.coverUrl ?? previewPages[0] ?? previewUrl ?? null,
            jobId: result.activePreviewJobId,
          })
        );
      } catch {
        // Cache refresh is optional after the database commit succeeds.
      }
    }

    void getPreviewPages(result.activePreviewJobId, undefined, {
      size: 'small',
      customerId: user?.customerId ?? null,
    }).then((urls) => {
      if (!urls[0]) return;
      setPreviewPages(urls);
      setPreviewUrl(urls[0]);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            `ymi_preview_${ensuredCreationId}`,
            JSON.stringify({ coverUrl: urls[0], jobId: result.activePreviewJobId })
          );
        } catch {
          // The live state already has the refreshed signed URLs.
        }
      }
    }).catch(() => undefined);

    return result.activePreviewJobId;
  }, [previewJobId, previewPages, previewUrl, replacePreviewUrl, selectedPreviewJobId, user?.customerId]);


  const performAddToCart = useCallback(async () => {
    if (!canAddToCart) return null
    if (!resolvedBook) return null
    if (!ensurePremiumVoiceSample()) return null
    const currentName = nameRef.current
    const currentAge = ageRef.current
    const parsedAge = Number.parseInt(currentAge, 10)

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

    const committedPreviewJobId = await commitSelectedPreviewForExit(ensuredCreationId)

    const item = await addToCart(
        resolvedBook!,
        {
        childName: currentName,
        childAge: currentAge,
        language: selectedLang,
        dedication: '',
        bookType,
        photoUrl: photoPreview ?? undefined,
        assetId: photoAssetId ?? undefined,
        storagePath: photoStoragePath ?? undefined,
        faceImageUrl: faceImageUrl ?? undefined,
        textOverrides: {
          child_name: currentName,
          child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
          dedication: '',
          language: selectedLang,
          book_type: bookType,
        },
        voiceAssetId: voiceAssetId ?? undefined,
        voiceStoragePath: voiceStoragePath ?? undefined,
        previewJobId: committedPreviewJobId,
        creationId: ensuredCreationId ?? undefined,
        },
        flowStep,
        undefined,
        previewPages[0] || previewUrl || undefined
    )

    return item ?? null;
    }, [canAddToCart, resolvedBook, addToCart, selectedLang, bookType, flowStep, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, voiceAssetId, voiceStoragePath, previewJobId, previewJobIdParam, viewMode, creationId, creationIdParam, resolveCreationId, previewPages, previewUrl, ensurePremiumVoiceSample, commitSelectedPreviewForExit]);

  const startAddToCart = useCallback(() => {
    const promise = performAddToCart()
      .then((item) => {
        if (!item) {
          triggerAddToCartFailedToast();
        } else {
          lastAddToCartItemRef.current = item;
        }
        return item;
      })
      .catch((error) => {
        console.error('Add to cart failed', error);
        triggerAddToCartFailedToast();
        return null;
      })
      .finally(() => {
        if (addToCartPromiseRef.current === promise) {
          addToCartPromiseRef.current = null;
        }
      });

    addToCartPromiseRef.current = promise;
    return promise;
  }, [performAddToCart, triggerAddToCartFailedToast]);


  const performCheckout = useCallback(async () => {
        if (!canCheckout) return
        if (checkoutInFlightRef.current) return
        if (!ensurePremiumVoiceSample()) return
        checkoutInFlightRef.current = true

        try {
        if (resolvedBook) {
    const currentName = nameRef.current
    const currentAge = ageRef.current
    const parsedAge = Number.parseInt(currentAge, 10)
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
            const committedPreviewJobId = await commitSelectedPreviewForExit(ensuredCreationId)
            const personalization = {
              childName: currentName,
              childAge: currentAge,
              language: selectedLang,
              dedication: '',
              bookType,
              photoUrl: photoPreview ?? undefined,
              assetId: photoAssetId ?? undefined,
              storagePath: photoStoragePath ?? undefined,
              faceImageUrl: faceImageUrl ?? undefined,
              textOverrides: {
                child_name: currentName,
                child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
                dedication: '',
                language: selectedLang,
                book_type: bookType,
              },
              voiceAssetId: voiceAssetId ?? undefined,
              voiceStoragePath: voiceStoragePath ?? undefined,
              previewJobId: committedPreviewJobId,
              creationId: ensuredCreationId ?? undefined,
            }

            const pendingAddToCartItem = addToCartPromiseRef.current
              ? await addToCartPromiseRef.current
              : null
            const recentAddToCartItem = pendingAddToCartItem?.creationId === ensuredCreationId
              ? pendingAddToCartItem
              : lastAddToCartItemRef.current?.creationId === ensuredCreationId
              ? lastAddToCartItemRef.current
              : null
            const existingItem = recentAddToCartItem
              ? recentAddToCartItem
              : ensuredCreationId
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
    }, [canCheckout, resolvedBook, selectedLang, bookType, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, voiceAssetId, voiceStoragePath, creationId, creationIdParam, resolveCreationId, flowStep, prepareCheckout, router, cart, user?.customerId, ensurePremiumVoiceSample, commitSelectedPreviewForExit]);

  const handleAddToCartClick = () => {
    if (!canAddToCart || isExiting) return;
    if (previewActionInFlightRef.current === 'CHECKOUT') return;
    if (!ensurePremiumVoiceSample()) return;
    if (!isPreviewPhotoLocked) {
      setShowAddToCartConfirm(true);
      return;
    }
    triggerFlyToCart();
    if (!addToCartPromiseRef.current) {
      void startAddToCart();
    }
  };

  const handleConfirmAddToCart = () => {
    setShowAddToCartConfirm(false);
    if (!canAddToCart || isExiting) return;
    triggerFlyToCart();
    if (!addToCartPromiseRef.current) {
      void startAddToCart();
    }
  };

  const handleCheckoutClick = () => {
    if (isExiting) return;
    if (previewActionInFlightRef.current) return;
    if (!ensurePremiumVoiceSample()) return;
    setShowAddToCartConfirm(false);
    previewActionInFlightRef.current = 'CHECKOUT';
    setPreviewActionPending('CHECKOUT');
    requestCheckout();
  };

  useEffect(() => {
    if (exitPhase !== 'IDLE') return;
    previewActionInFlightRef.current = null;
    setPreviewActionPending(null);
  }, [exitPhase]);

  useEffect(() => {
    return () => {
      if (pageToastTimerRef.current) {
        window.clearTimeout(pageToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (exitPhase !== 'REQUESTED') return

    beginExitExecution()
    }, [exitPhase, beginExitExecution]);

  useEffect(() => {
    if (exitPhase !== 'EXECUTING') return
    if (exitRunningRef.current) return

    exitRunningRef.current = true;

    const run = async () => {
        try {
        switch (exitIntent) {
          case 'CHECKOUT':
            await performCheckout()
            break
          case 'EXIT':
            await returnToCustomizeFromPreview()
            break
        }
        completeExit()
        } catch {
        failExit()
        } finally {
        exitRunningRef.current = false;
        }
    }

    run()
    }, [exitPhase, exitIntent, completeExit, failExit, performCheckout, returnToCustomizeFromPreview])




    const prepareFaceForUpload = useCallback(async (
      file: File,
      runId: number,
      onPhase: (phase: 'checking' | 'preparing') => void
    ): Promise<FacePreparationOutcome> => {
      const isCurrent = () => facePrepareRunIdRef.current === runId;
      onPhase('checking');

      const validation = await validateFaceImage(file);
      if (!isCurrent()) return { status: 'cancelled' };
      if (!validation.ok) return { status: 'failed', error: validation };

      const quality = await faceQualityCheck(file);
      if (!isCurrent()) return { status: 'cancelled' };

      if (!quality.ok) {
        const canAttemptAutoCrop =
          Boolean(quality.analysis?.autoCropCandidate) &&
          Boolean(quality.code && AUTO_CROP_FIXABLE_CODES.has(quality.code));

        if (!canAttemptAutoCrop) {
          return { status: 'failed', error: quality };
        }

        onPhase('preparing');
        const cropAttempt = await withTimeout(
          (async () => {
            const cropped = await autoCropFaceImage(file, quality.analysis);
            if (!cropped) return { file: null, error: null as FaceImageValidationResult | null };

            const croppedValidation = await validateFaceImage(cropped);
            if (!croppedValidation.ok) return { file: null, error: croppedValidation };

            const croppedQuality = await faceQualityCheck(cropped);
            if (!croppedQuality.ok) return { file: null, error: croppedQuality };

            return { file: cropped, error: null as FaceImageValidationResult | null };
          })(),
          AUTO_FACE_CROP_TIMEOUT_MS
        );
        if (!isCurrent()) return { status: 'cancelled' };
        if (cropAttempt.status === 'done' && cropAttempt.value.file) {
          return { status: 'ready', file: cropAttempt.value.file, autoCropped: true };
        }
        return {
          status: 'failed',
          error: cropAttempt.status === 'done' && cropAttempt.value.error
            ? cropAttempt.value.error
            : quality,
        };
      }

      onPhase('preparing');
      try {
        const prepared = await prepareFaceImage(file);
        if (!isCurrent()) return { status: 'cancelled' };
        return { status: 'ready', file: prepared, autoCropped: false };
      } catch {
        if (!isCurrent()) return { status: 'cancelled' };
        return { status: 'failed', error: null };
      }
    }, []);

    const startFacePreparation = useCallback(async (file: File, runId: number) => {
      setFacePrepareError(null);
      setPreparedFaceFile(null);
      setFaceAutoCropped(false);

      const result = await prepareFaceForUpload(file, runId, setFacePrepareStatus);
      if (result.status === 'cancelled') return;
      if (result.status === 'failed') {
        setFacePrepareStatus('failed');
        setFacePrepareError(
          result.error
            ? resolveFaceValidationError(result.error)
            : t('personalize.photoPrepareFailed')
        );
        return;
      }

      setPreparedFaceFile(result.file);
      setFaceAutoCropped(result.autoCropped);
      if (result.autoCropped) {
        showLocalPhotoPreview(result.file);
      }
      setFacePrepareStatus('ready');
    }, [prepareFaceForUpload, resolveFaceValidationError, showLocalPhotoPreview, t]);

    const resolvePreviewVariantError = useCallback((error: unknown) => {
      if (error instanceof PreviewVariantRequestError) {
        if (error.code === 'preview_variant_limit') {
          setPreviewVariantSessionCount(PREVIEW_VARIANT_SESSION_CAP);
          return t('personalize.previewVariantLimit');
        }
        if (error.code === 'preview_variant_in_flight') {
          return t('personalize.previewVariantInFlight');
        }
        if (
          error.code === 'creation_photo_committed' ||
          error.code === 'creation_cart_locked' ||
          error.code === 'creation_purchase_locked'
        ) {
          setIsPreviewPhotoLocked(true);
          return t('personalize.previewPhotoLocked');
        }
      }
      return error instanceof Error ? error.message : t('personalize.previewVariantFailed');
    }, [t]);

    const startPreviewVariantGeneration = useCallback(async (
      originalFile: File,
      preparedFile: File,
      preparedPhotoUrl: string
    ) => {
      if (!creationId || !previewJobId || previewVariantGenerationRef.current) return;
      if (previewVariantSessionCount >= PREVIEW_VARIANT_SESSION_CAP) {
        setPreviewVariantError(t('personalize.previewVariantLimit'));
        return;
      }

      previewVariantGenerationRef.current = true;
      setPreviewVariantError(null);
      setPreviewVariantPrepareStatus('preparing');
      const variantSessionId = ensurePreviewVariantSession();
      const requestId = window.crypto.randomUUID();
      let insertedJobId: string | null = null;

      try {
        const pendingFaceAsset = await uploadUserAsset(
          preparedFile,
          'face_image',
          'face',
          user?.customerId ?? undefined,
          {
            skipFacePreparation: true,
            originalName: originalFile.name,
            deferConfirm: true,
          }
        );
        if (!('bucket' in pendingFaceAsset)) {
          throw new Error('Pending face upload missing upload metadata');
        }

        const created = await createPreviewVariant({
          creationId,
          variantSessionId,
          requestId,
          pendingFaceAsset,
        });
        insertedJobId = created.jobId;
        setPreviewVariantSessionCount(created.sessionVariantCount);
        setPreviewVariantPrepareStatus('idle');

        const candidate: PreviewVariantView = {
          jobId: created.jobId,
          status: 'generating',
          pages: [],
          coverUrl: null,
          photoPreviewUrl: preparedPhotoUrl,
          faceAssetId: pendingFaceAsset.asset_id,
          faceStoragePath: pendingFaceAsset.storage_path,
          faceImageUrl: preparedPhotoUrl,
          original: false,
          countsTowardLimit: true,
        };
        setPreviewVariants((current) => {
          const existingIndex = current.findIndex((item) => item.jobId === candidate.jobId);
          if (existingIndex < 0) return [...current, candidate];
          return current.map((item) => item.jobId === candidate.jobId ? candidate : item);
        });

        const startedAt = Date.now();
        let fetchFailures = 0;
        while (Date.now() - startedAt < 10 * 60 * 1000) {
          try {
            const job = await getJob(created.jobId, user?.customerId ?? null);
            fetchFailures = 0;
            if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'cancel_requested') {
              setPreviewVariants((current) => current.map((item) =>
                item.jobId === created.jobId
                  ? { ...item, status: 'failed', countsTowardLimit: false }
                  : item
              ));
              setPreviewVariantSessionCount((count) => Math.max(0, count - 1));
              setPreviewVariantError(job.error_message || t('personalize.previewVariantFailed'));
              return;
            }

            if (job.status === 'running' || job.status === 'done') {
              const urls = await getPreviewPages(created.jobId, undefined, {
                size: 'small',
                customerId: user?.customerId ?? null,
              }).catch(() => []);
              if (urls[0]) {
                await waitForImageDecode(urls[0]);
                const readyVariant: PreviewVariantView = {
                  ...candidate,
                  status: 'ready',
                  pages: urls,
                  coverUrl: urls[0],
                };
                setPreviewVariants((current) => current.map((item) =>
                  item.jobId === created.jobId ? readyVariant : item
                ));
                applyPreviewVariantSelection(readyVariant);
                return;
              }
            }
          } catch {
            fetchFailures += 1;
            if (fetchFailures >= 8) {
              setPreviewVariantError(t('personalize.previewVariantStillProcessing'));
              return;
            }
          }

          await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }

        setPreviewVariantError(t('personalize.previewVariantStillProcessing'));
      } catch (error) {
        if (!insertedJobId) {
          previewVariantPhotoUrlsRef.current.delete(preparedPhotoUrl);
          URL.revokeObjectURL(preparedPhotoUrl);
        }
        setPreviewVariantPrepareStatus('failed');
        setPreviewVariantError(resolvePreviewVariantError(error));
      } finally {
        previewVariantGenerationRef.current = false;
      }
    }, [
      applyPreviewVariantSelection,
      creationId,
      ensurePreviewVariantSession,
      previewJobId,
      previewVariantSessionCount,
      resolvePreviewVariantError,
      t,
      user?.customerId,
    ]);

    const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const nextRunId = facePrepareRunIdRef.current + 1;
      facePrepareRunIdRef.current = nextRunId;

      if (viewState.showPreview) {
        if (isPreviewPhotoLocked || isPreviewVariantBusy || isPreviewVariantLimitReached) return;
        setPreviewVariantError(null);
        setPreviewVariantPrepareStatus('checking');
        void (async () => {
          const result = await prepareFaceForUpload(
            file,
            nextRunId,
            setPreviewVariantPrepareStatus
          );
          if (result.status === 'cancelled') return;
          if (result.status === 'failed') {
            setPreviewVariantPrepareStatus('failed');
            setPreviewVariantError(
              result.error
                ? resolveFaceValidationError(result.error)
                : t('personalize.photoPrepareFailed')
            );
            return;
          }

          const preparedPhotoUrl = URL.createObjectURL(result.file);
          previewVariantPhotoUrlsRef.current.add(preparedPhotoUrl);
          await startPreviewVariantGeneration(file, result.file, preparedPhotoUrl);
        })();
        return;
      }

      setPhoto(file);
      showLocalPhotoPreview(file);
      setPhotoAssetId(null);
      setPhotoStoragePath(null);
      setFaceImageUrl(null);
      setPreparedFaceFile(null);
      setFacePrepareError(null);
      setFaceAutoCropped(false);
      setPreviewUrl(null);
      void startFacePreparation(file, nextRunId);
    };


  // Persist the current form/preview stage for reload recovery.

  useEffect(() => {
    if (!bookID) return
    localStorage.setItem(`personalize:${bookID}:stage`, stage)
  }, [stage, bookID])



  // --- Flip Logic ---
  const turnPage = (direction: 'next' | 'prev') => {
      if (isFlipping) return;
      if (direction === 'next' && currentSpread >= maxSpreadIndex) return;
      if (direction === 'prev' && currentSpread <= 0) return;

      const targetSpread = direction === 'next' ? currentSpread + 1 : currentSpread - 1;
      preloadPreviewImage(resolvePreviewSpreadImage(targetSpread));
      preloadPreviewImage(resolvePreviewSpreadImage(targetSpread + 1));

      setFlipDirection(direction);
      setIsFlipping(true);
      setTimeout(() => {
          setCurrentSpread(prev => direction === 'next' ? prev + 1 : prev - 1);
          setIsFlipping(false);
          setFlipDirection(null);
      }, ANIMATION_DURATION * 1000); 
  };

  const returnToPreviewCover = () => {
    setIsFlipping(false);
    setFlipDirection(null);
    setCurrentSpread(0);
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

  const handlePreviewBookImageError = useCallback((imageUrl: string, options?: { refreshGenerated?: boolean }) => {
    markPreviewImageError(imageUrl);
    if (options?.refreshGenerated) {
      void refreshPreviewImages('image-error', { force: true });
    }
  }, [markPreviewImageError, refreshPreviewImages]);

  const renderPageContent = (side: 'left' | 'right', spreadIndex: number) => (
    <PreviewBookPageContent
      side={side}
      spreadIndex={spreadIndex}
      bookType={bookType}
      previewPages={previewPages}
      previewImageErrors={previewImageErrors}
      staticPreviewSecondPageUrl={staticPreviewSecondPageUrl}
      finalPreviewImages={finalPreviewImages}
      currentSpread={currentSpread}
      isFlipping={isFlipping}
      resolvedTitle={resolvedBook?.title || book?.title || t('personalize.preview')}
      labels={{
        previewAlt: t('personalize.preview'),
        previewPageStillCreating: t('personalize.previewPageStillCreating'),
        previewPageLocked: t('personalize.previewPageLocked'),
        backToCover: t('personalize.backToCover'),
        locked: t('personalize.locked'),
        pageLabel: (pageNumber) => t('personalize.pageLabel', { num: pageNumber }),
      }}
      onImageError={handlePreviewBookImageError}
      onTurnPage={turnPage}
      onReturnToCover={returnToPreviewCover}
    />
  );
  const isFacePreparing = facePrepareStatus === 'checking' || facePrepareStatus === 'preparing';
  const hasUsablePhoto = Boolean(photoAssetId || (photo && preparedFaceFile && facePrepareStatus === 'ready'));
  const isFormReady = areChildDetailsReady && hasUsablePhoto && !isFacePreparing && facePrepareStatus !== 'failed';
  const isAgeBelowRecommendedRange = useCallback((value: string) => {
    const parsedAge = parseChildAge(value);
    return parsedAge !== null && parsedAge < minimumRecommendedAge;
  }, [minimumRecommendedAge]);

  const startGeneratePreview = useCallback((consent: { dataGeneration: boolean; marketing: boolean }) => {
    dataGenerationConsentRef.current = consent.dataGeneration;
    marketingConsentRef.current = consent.marketing;
    setName(nameRef.current);
    setAge(ageRef.current);
    primaryAction();
  }, [primaryAction, setAge, setName]);

  const handleGeneratePreviewAction = useCallback((consent: { dataGeneration: boolean; marketing: boolean }) => {
    if (isAgeBelowRecommendedRange(ageRef.current)) {
      pendingGenerateConsentRef.current = consent;
      setShowAgeRangeConfirm(true);
      return;
    }

    startGeneratePreview(consent);
  }, [isAgeBelowRecommendedRange, startGeneratePreview]);

  const handleCloseAgeRangeConfirm = useCallback(() => {
    pendingGenerateConsentRef.current = null;
    setShowAgeRangeConfirm(false);
  }, []);

  const handleContinueAgeRangeConfirm = useCallback(() => {
    const consent = pendingGenerateConsentRef.current;
    pendingGenerateConsentRef.current = null;
    setShowAgeRangeConfirm(false);
    if (!consent) return;
    startGeneratePreview(consent);
  }, [startGeneratePreview]);

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
  
  return (
    <div className="page-surface min-h-screen flex flex-col font-sans relative z-20">
      <PersonalizeOverlays
        showFlyAnimation={showFlyAnimation}
        flyAnimationId={flyAnimationId}
        flyOrigin={flyOrigin}
        flyTarget={flyTarget}
        flyCoverUrl={previewPages[0] || previewUrl || book.coverUrl}
        toastMessage={pageToastMessage}
        showExitConfirm={showExitConfirm}
        showAgeRangeConfirm={showAgeRangeConfirm}
        showAddToCartConfirm={showAddToCartConfirm}
        exitLabels={{
          title: t('personalize.exitConfirmTitle'),
          body: t('personalize.exitConfirmBody'),
          stay: t('personalize.exitConfirmStay'),
          back: t('personalize.exitConfirmBack'),
        }}
        ageRangeLabels={{
          title: t('personalize.ageRangeConfirmTitle'),
          body: t('personalize.ageRangeConfirmBody', {
            minAge: minimumRecommendedAge,
            ageRange: book.ageLabel ?? `${minimumRecommendedAge}+`,
          }),
          continueAnyway: t('personalize.ageRangeContinueAnyway'),
          close: t('common.close'),
        }}
        addToCartConfirmLabels={{
          title: t('personalize.addToCartConfirmTitle'),
          body: t('personalize.addToCartConfirmBody'),
          cancel: t('personalize.addToCartConfirmCancel'),
          confirm: t('personalize.addToCartConfirmContinue'),
          close: t('common.close'),
        }}
        onStay={dismissExitConfirm}
        onBackToCustomize={() => void returnToCustomizeFromPreview()}
        onCloseAgeRangeConfirm={handleCloseAgeRangeConfirm}
        onContinueAgeRangeConfirm={handleContinueAgeRangeConfirm}
        onCloseAddToCartConfirm={() => setShowAddToCartConfirm(false)}
        onConfirmAddToCart={handleConfirmAddToCart}
      />

      <PersonalizeHeader
        title={book.title}
        user={user}
        cartCount={cartCount}
        cartItems={cart}
        displayCurrency={displayCurrency}
        isCartHydrated={isHydrated}
        cartButtonRef={cartIconRef}
        labels={{
          back: t('common.back'),
          myOrders: t('navbar.myOrders'),
          logOut: t('navbar.logOut'),
          logIn: t('navbar.logIn'),
        }}
        onBack={handleBack}
        onUpdateCartQuantity={updateCartQuantity}
        onRemoveCartItem={removeFromCart}
        onViewCart={() => void navigateAwayFromPreview(
          viewState.showPreview
            ? buildPreviewCartHref({
                bookId: bookID,
                creationId: creationId ?? '',
                committedPreviewJobId: previewJobId ?? '',
              })
            : '/cart'
        )}
        onOrdersClick={() => void navigateAwayFromPreview('/orders')}
        onLoginClick={() => openLoginModal()}
        onLogoutClick={() => void logoutFromPreview()}
      />

      {/* Main Content */}
      <main className="relative mx-auto w-full max-w-full flex-grow overflow-hidden px-4 py-6 md:container md:py-7">
        
        <ProgressSteps
          currentIndex={currentProgressIndex}
          labels={{
            story: t('personalize.stepStory'),
            customize: t('personalize.stepCustomize'),
            preview: t('personalize.stepPreview'),
            order: t('personalize.stepOrder'),
          }}
        />

        {/* Step 1 (Skipped logic) */}


            {/* Step 2: The Rich Form */}
            {viewState.showForm && (
                <CustomizeFormLayout
                  showcase={
                    <StoryShowcaseCard
                      carousel={
                        <ProductShowcaseCarousel
                          bookId={bookID}
                          title={templateTitle || book.title}
                          coverUrl={resolvedBook?.coverUrl}
                          images={resolvedBook?.showcaseImages}
                          isMobile={isMobile}
                          windowWidth={windowWidth}
                          uploadPanelRef={uploadPanelRef}
                        />
                      }
                      storyInfo={
                        <StoryInfoPanel
                          title={templateTitle || book.title}
                          description={templateInnerDescription || resolvedBook?.innerDescription || templateDescription || book.description}
                          magicAttributes={magicAttributes}
                          faqItems={bookFaqItems}
                          labels={{
                            magicAttributes: t('personalize.magicAttributes'),
                            aboutThisStory: 'About This Story',
                          }}
                          translateMagicAttribute={t}
                        />
                      }
                    />
                  }
                  form={
                    <CustomizeFormCard
                          title={t('personalize.customize')}
                          priceLabel={formatDisplayCurrency(currentPrice, displayCurrency)}
                          footer={
                            <GeneratePreviewAction
                              isFormReady={isFormReady}
                              isFacePreparing={isFacePreparing}
                              isPhotoFailed={facePrepareStatus === 'failed'}
                              isSupreme={isSupreme}
                              previewError={previewError}
                              labels={{
                                dataConsentRequired: t('personalize.dataConsentRequiredLabel'),
                                marketingConsentOptional: t('personalize.marketingConsentOptionalLabel'),
                                photoPreparing: t('personalize.photoPreparing'),
                                photoNeedsFix: t('personalize.photoNeedsFix'),
                                dataConsentRequiredShort: t('personalize.dataConsentRequiredShort'),
                                generateMagicPreview: t('personalize.generateMagicPreview'),
                                completeDetails: t('personalize.completeDetails'),
                                comingSoon: t('personalize.comingSoon'),
                              }}
                              onGenerate={handleGeneratePreviewAction}
                            />
                          }
                        >
                    <CustomizeFormFields
                      photoPreview={photoPreview}
                      facePrepareStatus={facePrepareStatus}
                      facePrepareError={facePrepareError}
                      faceAutoCropped={faceAutoCropped}
                      photoLabels={{
                        uploadChildPhoto: t('personalize.uploadChildPhoto'),
                        photoChecking: t('personalize.photoChecking'),
                        photoPreparing: t('personalize.photoPreparing'),
                        photoReady: t('personalize.photoReady'),
                        photoAutoCentered: t('personalize.photoAutoCentered'),
                        photoPrepareFailed: t('personalize.photoPrepareFailed'),
                        photoQualityReason: t('personalize.photoQualityReason'),
                        clickToChangePhoto: t('personalize.clickToChangePhoto'),
                        uploadPhotoHint: t('personalize.uploadPhotoHint'),
                        photoTips: t('personalize.photoTips'),
                      }}
                      onPhotoUpload={handlePhotoUpload}
                      recentFaces={recentFaces}
                      onSelectFace={handleSelectRecentFace}
                      onDeleteFace={handleDeleteFace}
                      initialName={name}
                      initialAge={age}
                      childDetailsSeedVersion={childDetailsSeedVersion}
                      recentProfiles={recentProfiles}
                      childLabels={{
                        nameLabel: t('personalize.nameLabel'),
                        namePlaceholder: t('personalize.namePlaceholder'),
                        ageLabel: t('personalize.ageLabel'),
                        agePlaceholder: t('personalize.agePlaceholder'),
                        noHistory: t('personalize.noHistory'),
                      }}
                      ageRangeWarning={ageRangeWarningText}
                      minimumRecommendedAge={minimumRecommendedAge}
                      onLoadProfiles={loadProfiles}
                      onChildDetailsChange={handleChildDetailsChange}
                      onDeleteProfileValue={handleDeleteProfile}
                      selectedLang={selectedLang}
                      languageLabels={{
                        field: t('personalize.storyLanguage'),
                        english: t('personalize.storyLanguageEnglish'),
                        simplifiedChinese: t('personalize.storyLanguageSimplifiedChinese'),
                        traditionalChinese: t('personalize.storyLanguageTraditionalChinese'),
                        comingSoon: t('common.comingSoon'),
                      }}
                      onLanguageChange={setSelectedLang}
                      bookType={bookType}
                      packageLabels={{
                        field: t('personalize.bookType'),
                        digitalTitle: t('personalize.bookTypeDigitalTitle'),
                        digitalSubtitle: t('personalize.bookTypeDigitalSubtitle'),
                        basicTitle: t('personalize.bookTypeBasicTitle'),
                        basicSubtitle: t('personalize.bookTypeBasicSubtitle'),
                        supremeTitle: t('personalize.bookTypeSupremeTitle'),
                        supremeSubtitle: t('personalize.bookTypeSupremeSubtitle'),
                        whatIncluded: t('personalize.whatIncluded'),
                      }}
                      includedItems={{
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
                          t('personalize.included.basic5'),
                          t('personalize.included.basic6'),
                        ],
                        supreme: [
                          t('personalize.included.supreme1'),
                          t('personalize.included.supreme2'),
                          t('personalize.included.supreme3'),
                          t('personalize.included.supreme4'),
                          t('personalize.included.supreme5'),
                          t('personalize.included.supreme6'),
                          t('personalize.included.supreme7'),
                        ],
                      }}
                      onBookTypeChange={setBookType}
                      requiresVoiceSample={requiresVoiceSample}
                      voicePanelRef={voicePanelRef}
                      voiceCustomerId={user?.customerId}
                      voiceAssetId={voiceAssetId}
                      voiceStoragePath={voiceStoragePath}
                      voiceSignedUrl={resolvedVoiceSignedUrl}
                      voiceValidationError={voiceValidationError}
                      onVoiceUploadComplete={handleVoiceUploadComplete}
                      onClearVoiceValidation={() => setVoiceValidationError(null)}
                    />
                    </CustomizeFormCard>
                  }
                />
            )}

            {/* Step 3: Preview */}
            {viewState.showPreview && (
                <PreviewStepLayout
                  intro={
                    <PreviewIntroHeader
                      title={t('personalize.previewTitle', { name })}
                      subtitle={t('personalize.previewSubtitle')}
                      changePhotoLabel={t('personalize.changePhoto')}
                      busyLabel={t('personalize.previewVariantPreparing')}
                      showChangePhoto={!isPreviewPhotoLocked}
                      changePhotoDisabled={isPreviewVariantBusy || isPreviewVariantLimitReached}
                      changePhotoBusy={isPreviewVariantBusy}
                      changePhotoError={previewVariantError}
                      onPhotoUpload={handlePhotoUpload}
                    />
                  }
                  book={
                    <PreviewBookStage
                      stageHeight={previewStageHeight}
                      previewScale={previewScale}
                      pageWidth={PAGE_WIDTH}
                      pageHeight={PREVIEW_PAGE_HEIGHT}
                      animationDuration={ANIMATION_DURATION}
                      currentSpread={currentSpread}
                      isFlipping={isFlipping}
                      flipDirection={flipDirection}
                      isLeftPageVisible={isLeftPageVisible}
                      staticLeftIndex={staticLeftIndex}
                      centerBindingPattern={centerBindingPattern}
                      pageStackPattern={pageStackPattern}
                      faceStyle={faceStyle}
                      previewBookShadow={previewBookShadow}
                      renderPageContent={renderPageContent}
                    />
                  }
                  gallery={
                    !isPreviewPhotoLocked ? (
                      <PreviewVariantGallery
                        items={previewVariants.map((variant) => ({
                          jobId: variant.jobId,
                          thumbnailUrl: variant.coverUrl || variant.photoPreviewUrl,
                          status: variant.status,
                          selected: variant.jobId === selectedPreviewJobId,
                          original: variant.original,
                          removing: discardingPreviewVariantIds.has(variant.jobId),
                        }))}
                        atLimit={isPreviewVariantLimitReached}
                        labels={{
                          title: t('personalize.previewVariantsTitle'),
                          original: t('personalize.previewVariantOriginal'),
                          version: (number) => t('personalize.previewVariantNumber', { number }),
                          selected: t('personalize.previewVariantSelected'),
                          generating: t('personalize.previewVariantGenerating'),
                          failed: t('personalize.previewVariantFailedShort'),
                          remove: t('personalize.previewVariantRemove'),
                          limit: t('personalize.previewVariantLimit'),
                        }}
                        onSelect={handleSelectPreviewVariant}
                        onRemove={(jobId) => void handleDiscardPreviewVariant(jobId)}
                      />
                    ) : null
                  }
                  actions={
                    <PreviewActionBar
                      acknowledgementLabel={t('personalize.checkoutAcknowledgement')}
                      acknowledgementRequiredLabel={t('personalize.checkoutAcknowledgementRequired')}
                      shareLabel={isPreparingShare ? t('common.loading') : t('share.previewButton')}
                      shareDescription={t('share.previewDescription')}
                      shareCopyLabel={t('share.copyLink')}
                      addToCartLabel={t('personalize.addToCartPrice', { price: formatDisplayCurrency(currentPrice, displayCurrency) })}
                      checkoutLabel={t('personalize.checkoutNow')}
                      loadingLabel={t('common.loading')}
                      shareError={shareError}
                      canShare={Boolean(creationId)}
                      isPreparingShare={isPreparingShare}
                      isCheckoutPending={previewActionPending === 'CHECKOUT'}
                      onShare={handleOpenPreviewShare}
                      onAddToCart={handleAddToCartClick}
                      onCheckout={handleCheckoutClick}
                      addToCartButtonRef={addToCartBtnRef}
                    />
                  }
                />
            )}
        <PreviewShareDialog
          open={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          shareUrl={previewShareUrl}
          previewImageUrl={previewShareImageUrl}
          labels={{
            title: t('share.previewTitle'),
            description: t('share.previewDescription'),
            shareText: t('share.previewTemplate'),
            note: t('share.previewNote'),
          }}
        />

        <LoadingPreviewOverlay
          show={viewState.showLoading}
          loadingText={loadingText}
          progress={progress}
          countdownSeconds={loadingCountdownSeconds}
          labels={{
            estimatedWait: t('personalize.estimatedWait', { seconds: loadingCountdownSeconds }),
            almostThere: t('personalize.almostThere'),
            didYouKnow: t('personalize.didYouKnow'),
          }}
        />
      </main>
    </div>
  );
};
