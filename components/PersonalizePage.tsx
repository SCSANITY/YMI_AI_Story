'use client'
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersonalizeState } from '@/components/personalize/usePersonalizeState';
import { autoCropFaceImage, faceQualityCheck, prepareFaceImage, uploadUserAsset, validateFaceImage, type FaceImageValidationResult, type PendingUserAssetUpload } from '@/services/assets';
import {
  cancelPreviewJob,
  commitPreviewVariant,
  createPreviewJob,
  createPreviewVariant,
  discardPreviewVariant,
  discardPreviewVariantSession,
  PreviewVariantRequestError,
} from '@/services/jobs';
import {
  getPersistedPersonalizeStep,
  usePersonalizeStage,
} from '@/components/personalize/usePersonalizeStage';
import { isUuid } from '@/lib/validators';
import { useI18n } from '@/lib/useI18n';
import { formatDisplayCurrency } from '@/lib/locale-pricing';
import { isBrowserTranslated } from '@/lib/browser-translation';
import { buildPreviewCartHref } from '@/lib/cart-navigation';
import { PREVIEW_VARIANT_SESSION_CAP } from '@/lib/preview-variants';
import { PreviewActionBar } from '@/components/personalize/PreviewActionBar';
import type { GeneratePreviewConsent } from '@/components/personalize/GeneratePreviewAction';
import { ProductShowcaseCarousel } from '@/components/personalize/ProductShowcaseCarousel';
import type { RecentFaceItem } from '@/components/personalize/RecentFacesStrip';
import { ProgressSteps } from '@/components/personalize/ProgressSteps';
import { PersonalizeHeader } from '@/components/personalize/PersonalizeHeader';
import { PersonalizeOverlays } from '@/components/personalize/PersonalizeOverlays';
import { PreviewGeneratingCover } from '@/components/personalize/PreviewGeneratingCover';
import { PreviewAccessCover } from '@/components/personalize/PreviewAccessCover';
import { decodePreviewImage as waitForImageDecode, useDecodedPreviewCover } from '@/components/personalize/useDecodedPreviewCover';
import { canHydrateEdition } from '@/lib/edition-hydration';
import { PreviewIntroHeader } from '@/components/personalize/PreviewIntroHeader';
import { PreviewShareDialog } from '@/components/personalize/PreviewShareDialog';
import { PreviewBookStage } from '@/components/personalize/PreviewBookStage';
import { PreviewBookPageContent } from '@/components/personalize/PreviewBookPageContent';
import { StoryShowcaseCard } from '@/components/personalize/StoryShowcaseCard';
import { CustomizeFormLayout } from '@/components/personalize/CustomizeFormLayout';
import { getBookPackagePrice } from '@/lib/package-pricing';
import { SIGNATURE_VOICE_CONSENT_VERSION } from '@/lib/signature-voice';
import { PreviewStepLayout } from '@/components/personalize/PreviewStepLayout';
import { PreviewVariantGallery } from '@/components/personalize/PreviewVariantGallery';
import { PersonalizeFormFlow, type PersonalizeFormStep } from '@/components/personalize/PersonalizeFormFlow';
import { PersonalizeProductIntro } from '@/components/personalize/PersonalizeProductIntro';
import { MagicAttributesPanel } from '@/components/personalize/MagicAttributesPanel';
import { PreviewPurchasePanel } from '@/components/personalize/PreviewPurchasePanel';
import { PreviewDedication, type DedicationAcknowledgement, type PreviewDedicationHandle } from '@/components/personalize/PreviewDedication';
import { rememberDedicationAcknowledgement } from '@/lib/dedication';
import { SignatureVoiceDialog } from '@/components/personalize/SignatureVoiceDialog';
import { PRIVACY_REASSURANCE_COPY } from '@/components/personalize/PrivacyReassurance';
import type { PendingVoiceRecording } from '@/components/personalize/VoiceRecorderPanel';
import { templateStorageUrl, type CatalogBook } from '@/lib/book-catalog';
import type { CartItem } from '@/types';
import { buildTemplateLockedPreviewPresentation } from '@/lib/template-locked-preview';
import {
  getPreviewMaxSpreadIndex,
  getPreviewPreloadSpreadIndexes,
  getPreviewSpreadUrls,
} from '@/lib/preview-book-presentation';
import { previewImageIdentity } from '@/lib/preview-image-continuity';
import type { PreviewVariantView } from '@/lib/preview-variant-view';
import { emitYmiTrackingEvent, resolveTrackingFormat } from '@/lib/tracking-policy';
import { normalizeStoryLanguage } from '@/lib/story-language';
import { usePreviewController } from '@/components/personalize/usePreviewController';
import {
  normalizePurchasePackageType,
  type PurchasePackageType,
} from '@/lib/purchase-configuration';
import {
  readPersonalizeFormDraft,
  writePersonalizeFormDraft,
} from '@/lib/personalize-form-draft';
import { usePersonalizeHistory } from '@/components/personalize/usePersonalizeHistory';
import { resolvePersonalizeEntryStep } from '@/lib/personalize-entry';
import {
  isRecoverablePurchaseIdentityError,
  PurchaseConfigurationRequestError,
  savePurchaseConfiguration,
} from '@/services/purchaseConfiguration';

type FacePrepareStatus = 'idle' | 'checking' | 'preparing' | 'ready' | 'failed';

type FacePreparationOutcome =
  | { status: 'ready'; file: File; autoCropped: boolean }
  | { status: 'failed'; error: FaceImageValidationResult | null }
  | { status: 'cancelled' };

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

export default function PersonalizePage({
  bookID,
  initialBook,
}: {
  bookID: string
  initialBook: CatalogBook
}) {

  const fsm = usePersonalizeStage()
  const { t } = useI18n()

  const { user, openLoginModal, logout, addToCart, removeFromCart, updateCartQuantity, prepareCheckout, resumeData, resumePersonalization, displayCurrency, cart, isHydrated } = useGlobalContext();
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const book = initialBook;
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewMode = searchParams?.get('view') || 'edit';
  const creationIdParam = searchParams?.get('creationId') || null;
  const previewJobIdParam = searchParams?.get('jobId') || null;
  const previewSource = searchParams?.get('source') || null;
  const dedicationOnArrival = searchParams?.get('dedication') === '1';
  const dedicationReturnTo = searchParams?.get('returnTo') || null;
  const dedicationPurchaseOnArrival = searchParams?.get('purchase') === '1';
  const productIntroEntryRef = useRef(viewMode !== 'preview' && searchParams?.get('entry') === 'intro');

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
    canAddToCart: stageCanAddToCart,
    canCheckout: stageCanCheckout,
    canBack,
    backIntent,
    requestCheckout,
    primaryAction,
    } = fsm;
  const savedStep = getPersistedPersonalizeStep(stage)
  const personalizeDraftOwnerKey = user?.customerId
    ? `customer:${user.customerId}`
    : 'anonymous-session'
  const {
    recentFaces,
    recentProfiles,
    recentVoices,
    status: personalizeHistoryStatus,
    refresh: refreshPersonalizeHistory,
    rememberProfile,
    forgetFace,
    forgetProfile,
  } = usePersonalizeHistory({
    customerId: user?.customerId ?? null,
    enabled: viewState.showForm,
  })
  const [isPersonalizeDraftReady, setIsPersonalizeDraftReady] = useState(false)

  // Customer-facing journey progress.
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
  const dedicationRef = useRef<PreviewDedicationHandle>(null);
  const dedicationAcknowledgementRef = useRef<DedicationAcknowledgement | null>(null);
  const dedicationRequestInFlightRef = useRef(false);
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
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
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
  const personalizationStartTrackedRef = useRef(false);
  const previewReadyTrackedJobIdsRef = useRef<Set<string>>(new Set());

  const handleStartPersonalization = useCallback(() => {
    setFormStep('PHOTO');
    if (personalizationStartTrackedRef.current) return;
    personalizationStartTrackedRef.current = true;
    emitYmiTrackingEvent('start_personalization');
  }, []);

  const handleFormStepChange = useCallback((nextStep: PersonalizeFormStep) => {
    setFormStep(nextStep);
  }, []);

  const trackPreviewReady = useCallback((jobId: string) => {
    if (!jobId || previewReadyTrackedJobIdsRef.current.has(jobId)) return;
    previewReadyTrackedJobIdsRef.current.add(jobId);
    emitYmiTrackingEvent('preview_ready');
  }, []);

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
  const ANIMATION_DURATION = 0.8; 
  
  const [currentSpread, setCurrentSpread] = useState(0); 
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAgeRangeConfirm, setShowAgeRangeConfirm] = useState(false);
  const [showAddToCartConfirm, setShowAddToCartConfirm] = useState(false);
  const [formStep, setFormStep] = useState<PersonalizeFormStep>('INTRO');
  const lastMobileTopSurfaceRef = useRef<'INTRO' | 'PREVIEW' | null>(null);
  const mobileTopSurface = viewState.showPreview
    ? 'PREVIEW'
    : viewState.showForm && formStep === 'INTRO'
      ? 'INTRO'
      : null;

  useLayoutEffect(() => {
    if (!mobileTopSurface) {
      lastMobileTopSurfaceRef.current = null;
      return;
    }

    const mobilePersonalize = window.matchMedia('(max-width: 767px)');
    if (!mobilePersonalize.matches || lastMobileTopSurfaceRef.current === mobileTopSurface) return;

    lastMobileTopSurfaceRef.current = mobileTopSurface;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [mobileTopSurface]);

  const pendingGenerateConsentRef = useRef<GeneratePreviewConsent | null>(null);
  const [voiceAssetId, setVoiceAssetId] = useState<string | null>(null);
  const [voiceStoragePath, setVoiceStoragePath] = useState<string | null>(null);
  const [voiceDurationSeconds, setVoiceDurationSeconds] = useState<number | null>(null);
  const [pendingVoiceRecording, setPendingVoiceRecording] = useState<PendingVoiceRecording | null>(null);
  const pendingVoiceRecordingRef = useRef<PendingVoiceRecording | null>(null);
  const [isVoiceDialogOpen, setIsVoiceDialogOpen] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isSavingEdition, setIsSavingEdition] = useState(false);
  const [editionError, setEditionError] = useState<string | null>(null);
  const purchaseBookTypeRef = useRef<PurchasePackageType>(
    bookType === 'supreme' ? bookType : 'basic'
  );
  const confirmedPurchaseBookTypeRef = useRef<PurchasePackageType>(purchaseBookTypeRef.current);
  const queuedPurchaseBookTypeRef = useRef<PurchasePackageType | null>(null);
  const editionSelectionRevisionRef = useRef(0);
  const purchaseConfigurationDrainPromiseRef = useRef<Promise<void> | null>(null);
  const voiceAssetIdRef = useRef<string | null>(null);
  const selectedPreviewCreationIdRef = useRef<string | null>(null);
  const previewVariantSessionIdRef = useRef<string | null>(null);
  const previewVariantCleanupInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const {
    previewJobId,
    setPreviewJobId,
    selectedPreviewJobId,
    selectPreviewJobId,
    activeJobId: displayedPreviewJobId,
    previewUrl,
    setPreviewUrl,
    previewPages,
    setPreviewPages,
    previewBookPresentation,
    setPreviewBookPresentation,
    previewVariants,
    setPreviewVariants,
    capacityWaitingByJobId,
    applyPreviewDisplayAssetsForJob,
    previewAccessState,
    previewCompletionReady,
    error: previewError,
    isPartialFailure: isPreviewPartialFailure,
    canRetry: canRetryPreview,
    isRetrying: isRetryingPreview,
    retry: retryPreview,
    setError: setPreviewError,
    refresh: refreshPreviewImages,
    watchJob: watchPreviewJob,
    cancelWatch: cancelPreviewWatch,
  } = usePreviewController({
    active: stage === 'PREVIEW',
    customerId: user?.customerId ?? null,
  });
  const previewVariantsRef = useRef<PreviewVariantView[]>([]);
  const [previewVariantSessionCount, setPreviewVariantSessionCount] = useState(0);
  const [previewVariantPrepareStatus, setPreviewVariantPrepareStatus] = useState<FacePrepareStatus>('idle');
  const [previewVariantError, setPreviewVariantError] = useState<string | null>(null);
  const [discardingPreviewVariantIds, setDiscardingPreviewVariantIds] = useState<Set<string>>(() => new Set());
  const [isPreviewPhotoLocked, setIsPreviewPhotoLocked] = useState(false);
  const previewVariantGenerationRef = useRef(false);
  const previewVariantPhotoUrlsRef = useRef<Set<string>>(new Set());
  const [creationId, setCreationId] = useState<string | null>(null);
  const creationIdRef = useRef<string | null>(null);
  const previewJobIdRef = useRef<string | null>(null);
  const [previewImageErrors, setPreviewImageErrors] = useState<Set<string>>(() => new Set());
  const [decodedFirstSpreadPairKey, setDecodedFirstSpreadPairKey] = useState<string | null>(null);
  const firstSpreadDecodeFailureRef = useRef<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [previewShareUrl, setPreviewShareUrl] = useState<string | null>(null);
  const [previewPublicShareImageUrl, setPreviewPublicShareImageUrl] = useState<string | null>(null);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);
  const previewActionInFlightRef = useRef<'CHECKOUT' | null>(null);
  const [previewActionPending, setPreviewActionPending] = useState<'CHECKOUT' | null>(null);
  const [checkoutTransitionPhase, setCheckoutTransitionPhase] = useState<
    'preparing' | 'securing' | 'opening' | null
  >(null);
  const checkoutInFlightRef = useRef(false);
  const committedPreviewSelectionRef = useRef<{
    creationId: string
    selectedPreviewJobId: string
    activePreviewJobId: string
  } | null>(null);
  const previewCommitInFlightRef = useRef<{
    key: string
    promise: ReturnType<typeof commitPreviewVariant>
  } | null>(null);
  const preloadedPreviewImagesRef = useRef<Set<string>>(new Set());
  const [templateCoverUrl, setTemplateCoverUrl] = useState<string | null>(initialBook?.coverUrl || null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(initialBook?.title || null);
  const [templateDescription, setTemplateDescription] = useState<string | null>(initialBook?.description || null);
  const [templateInnerDescription, setTemplateInnerDescription] = useState<string | null>(initialBook?.innerDescription || null);
  const [voicePlaybackUrl, setVoicePlaybackUrl] = useState<string | null>(null);
  const [voiceValidationError, setVoiceValidationError] = useState<string | null>(null);
  useEffect(() => {
    previewVariantsRef.current = previewVariants;
  }, [previewVariants]);

  useEffect(() => {
    if (!creationId || !previewJobId) {
      if (!creationId) {
        selectedPreviewCreationIdRef.current = null;
        selectPreviewJobId(null);
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
      selectPreviewJobId(previewJobId);
      setPreviewVariants([
        {
          jobId: previewJobId,
          status: previewUrl || previewPages[0] ? 'ready' : 'generating',
          pages: previewPages,
          presentation: previewBookPresentation,
          coverUrl: previewUrl || previewPages[0],
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
  }, [creationId, previewJobId, previewPages, previewBookPresentation, previewUrl, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, selectPreviewJobId, setPreviewVariants]);

  useEffect(() => {
    if (!selectedPreviewJobId) return;
    setPreviewVariants((current) =>
      current.map((variant) =>
        variant.jobId === selectedPreviewJobId
          ? {
              ...variant,
              photoPreviewUrl: photoPreview || variant.photoPreviewUrl,
              faceAssetId: photoAssetId || variant.faceAssetId,
              faceStoragePath: photoStoragePath || variant.faceStoragePath,
              faceImageUrl: faceImageUrl || variant.faceImageUrl,
            }
          : variant
      )
    );
  }, [selectedPreviewJobId, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, setPreviewVariants]);

  useEffect(() => {
    const photoUrls = previewVariantPhotoUrlsRef.current;
    return () => {
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
      photoUrls.clear();
    };
  }, []);

  const applyPreviewVariantSelection = useCallback((variant: PreviewVariantView) => {
    if (variant.status !== 'ready' || !variant.coverUrl) return false;
    selectPreviewJobId(variant.jobId);
    setPreviewPages(variant.pages.length ? variant.pages : [variant.coverUrl]);
    setPreviewBookPresentation(variant.presentation);
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
    return true;
  }, [selectPreviewJobId, setFaceImageUrl, setPhoto, setPhotoAssetId, setPhotoPreview, setPhotoStoragePath, setPreviewBookPresentation, setPreviewPages, setPreviewUrl]);

  const handleSelectPreviewVariant = useCallback((jobId: string) => {
    const variant = previewVariants.find((item) => item.jobId === jobId);
    if (!variant || !applyPreviewVariantSelection(variant)) return;

    void refreshPreviewImages('selection', { force: true });
  }, [applyPreviewVariantSelection, previewVariants, refreshPreviewImages]);

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
  }, [applyPreviewVariantSelection, setPreviewVariants]);

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

  const isPreviewVariantBusy =
    previewVariantPrepareStatus === 'checking' ||
    previewVariantPrepareStatus === 'preparing' ||
    previewVariants.some((variant) => variant.status === 'generating');
  const isPreviewVariantLimitReached =
    previewVariantSessionCount >= PREVIEW_VARIANT_SESSION_CAP;
  const isGeneratingPreviewCapacityWaiting = Boolean(
    viewState.showPreview && previewJobId && capacityWaitingByJobId[previewJobId]
  );
  const isPreviewVariantCapacityWaiting = Boolean(
    viewState.showPreview && previewVariants.some(
      (variant) => variant.status === 'generating' && capacityWaitingByJobId[variant.jobId]
    )
  );

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
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef(name);
  const ageRef = useRef(age);
  const [areChildDetailsReady, setAreChildDetailsReady] = useState(false);
  const minimumRecommendedAge = getBookMinimumAge(book);
  const ageRangeWarningText = t('personalize.ageRangeInlineWarning', {
    minAge: minimumRecommendedAge,
    ageRange: book?.ageLabel ?? `${minimumRecommendedAge}+`,
  });
  // --- Mobile Responsive State ---
  const [windowWidth, setWindowWidth] = useState(1024);
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
  }, [name, age]);

  const handleChildDetailsChange = useCallback((details: { name: string; age: string }) => {
    nameRef.current = details.name;
    ageRef.current = details.age;
    setName(details.name);
    setAge(details.age);
    setShowAgeRangeConfirm(false);
    setAreChildDetailsReady((prev) => {
      const next = details.name.trim().length > 0 && details.age.trim().length > 0;
      return prev === next ? prev : next;
    });
  }, [setAge, setName]);

  // --- Calculations ---
  const purchaseBookType: PurchasePackageType = bookType === 'supreme'
    ? bookType
    : 'basic';
  const currentPackagePrice = book ? getBookPackagePrice(book, purchaseBookType) : null;
  const currentPrice = currentPackagePrice?.effectivePriceUsd ?? 0;
  const requiresVoiceSample = purchaseBookType === 'supreme';
  const isMobile = windowWidth < 768;
  const previewShareImageUrl = previewPublicShareImageUrl || previewUrl || previewPages[0] || resolvedBook?.coverUrl || null;

  useEffect(() => {
    purchaseBookTypeRef.current = purchaseBookType;
    if (!purchaseConfigurationDrainPromiseRef.current && !queuedPurchaseBookTypeRef.current) {
      confirmedPurchaseBookTypeRef.current = purchaseBookType;
    }
  }, [purchaseBookType]);

  useEffect(() => {
    voiceAssetIdRef.current = voiceAssetId;
  }, [voiceAssetId]);
  const lockedPreviewPresentation = useMemo(
    () => buildTemplateLockedPreviewPresentation(resolvedBook?.lockedPreviewPages),
    [resolvedBook?.lockedPreviewPages],
  );
  const magicAttributes = useMemo(
    () => (Array.isArray(resolvedBook?.magicAttributes) ? resolvedBook.magicAttributes.filter((attribute) => attribute.label.trim()) : []),
    [resolvedBook],
  );
  const previewDisplayState = useMemo(() => ({
    urls: previewPages,
    presentation: previewBookPresentation,
  }), [previewBookPresentation, previewPages]);
  const maxSpreadIndex = Math.max(
    TOTAL_SPREADS,
    getPreviewMaxSpreadIndex(previewDisplayState),
  );
  const currentVoiceSample = useMemo(() => {
    if (!voiceAssetId) return null;
    return recentVoices.find((voice) => voice.asset_id === voiceAssetId) ?? null;
  }, [recentVoices, voiceAssetId]);

  const resolvedVoicePlaybackUrl = voicePlaybackUrl || currentVoiceSample?.playback_url || null;
  const resolvedVoiceDurationSeconds = voiceDurationSeconds
    ?? (Number(currentVoiceSample?.metadata?.duration_seconds) || null);
  const markPreviewImageError = useCallback((image: string) => {
    if (!image) return;
    setPreviewImageErrors((prev) => {
      if (prev.has(image)) return prev;
      const next = new Set(prev);
      next.add(image);
      return next;
    });
  }, []);
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

  const decodedPreviewCover = useDecodedPreviewCover(displayedPreviewJobId, previewUrl, setPreviewError);
  const hasReadyPreviewCover = decodedPreviewCover.isReady;
  const isPreviewCoverPending = viewState.showPreview && !hasReadyPreviewCover;
  const isPreviewUnavailable = stage === 'PREVIEW' && isPreviewCoverPending && previewAccessState === 'unavailable';
  const isPreviewRestoring = stage === 'PREVIEW' && isPreviewCoverPending && !isPreviewUnavailable;
  const visiblePreviewPresentation = useMemo(() => {
    if (!previewBookPresentation?.cover || !decodedPreviewCover.url) return previewBookPresentation;
    return { ...previewBookPresentation, cover: { ...previewBookPresentation.cover, url: decodedPreviewCover.url } };
  }, [decodedPreviewCover.url, previewBookPresentation]);
  const firstPreviewSpreadUrls = useMemo(
    () => getPreviewSpreadUrls(previewDisplayState, 1),
    [previewDisplayState],
  );
  const firstPreviewSpreadLeftUrl = firstPreviewSpreadUrls[0] ?? null;
  const firstPreviewSpreadRightUrl = firstPreviewSpreadUrls[1] ?? null;
  const firstPreviewSpreadPairKey = displayedPreviewJobId
    && firstPreviewSpreadLeftUrl
    && firstPreviewSpreadRightUrl
    ? `${displayedPreviewJobId}:${previewImageIdentity(firstPreviewSpreadLeftUrl)}|${previewImageIdentity(firstPreviewSpreadRightUrl)}`
    : null;
  const isFirstPreviewSpreadPairReady = Boolean(
    firstPreviewSpreadPairKey && decodedFirstSpreadPairKey === firstPreviewSpreadPairKey
  );

  useEffect(() => {
    if (
      !viewState.showPreview
      || !firstPreviewSpreadPairKey
      || !firstPreviewSpreadLeftUrl
      || !firstPreviewSpreadRightUrl
      || isFirstPreviewSpreadPairReady
    ) return;

    let active = true;
    void Promise.all([
      waitForImageDecode(firstPreviewSpreadLeftUrl),
      waitForImageDecode(firstPreviewSpreadRightUrl),
    ]).then(() => {
      if (!active) return;
      firstSpreadDecodeFailureRef.current = null;
      setDecodedFirstSpreadPairKey(firstPreviewSpreadPairKey);
    }).catch(() => {
      if (!active || firstSpreadDecodeFailureRef.current === firstPreviewSpreadPairKey) return;
      firstSpreadDecodeFailureRef.current = firstPreviewSpreadPairKey;
      void refreshPreviewImages('image-error', { force: true });
    });

    return () => {
      active = false;
    };
  }, [
    firstPreviewSpreadLeftUrl,
    firstPreviewSpreadPairKey,
    firstPreviewSpreadRightUrl,
    isFirstPreviewSpreadPairReady,
    refreshPreviewImages,
    viewState.showPreview,
  ]);
  const canAddToCart = stageCanAddToCart && hasReadyPreviewCover && previewCompletionReady && !previewError;
  const canCheckout = stageCanCheckout && hasReadyPreviewCover && previewCompletionReady && !previewError;

  // Visual state used by the book animation shell.
  const isClosing = isFlipping && flipDirection === 'prev' && currentSpread === 1;
  const isVisualBookOpen = currentSpread > 0 || (isFlipping && flipDirection === 'next' && currentSpread === 0);
  const isBookClosed = !isVisualBookOpen;
  // Keep the flow initialized only once per mounted personalize session.
  const didInitFSM = useRef(false);
  const initializedPersonalizeDraftKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (didInitFSM.current) return
    if (!isHydrated) return
    if (!bookID) return

    if (!productIntroEntryRef.current && resumeData && resumeData.bookID === bookID) {
        restore({
        hasDraft: !!resumeData.personalization,
        savedStage: viewMode === 'preview' ? 'PREVIEW' : 'FORM',
        })
        if (viewMode !== 'preview') {
          const personalization = resumeData.personalization
          setFormStep(
            personalization?.assetId || personalization?.photo
              ? personalization.childName && personalization.childAge
                ? 'REVIEW'
                : 'DETAILS'
              : 'PHOTO'
          )
        }
    } else if (viewMode === 'preview' && (creationIdParam || previewJobIdParam)) {
        restore({
        hasDraft: true,
        savedStage: 'PREVIEW',
        })
    } else {
        const draft = readPersonalizeFormDraft(
          window.sessionStorage,
          bookID,
          personalizeDraftOwnerKey
        )
        startForm()
        setFormStep(resolvePersonalizeEntryStep(draft, productIntroEntryRef.current))
    }

    didInitFSM.current = true
    if (searchParams?.get('entry') === 'intro') {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('entry')
      const query = params.toString()
      window.history.replaceState(window.history.state, '', `/personalize/${encodeURIComponent(bookID)}${query ? `?${query}` : ''}`)
    }
  }, [
    bookID,
    creationIdParam,
    isHydrated,
    personalizeDraftOwnerKey,
    previewJobIdParam,
    restore,
    resumeData,
    searchParams,
    startForm,
    viewMode,
  ])



  useEffect(() => {
    if (!resumeData) return
    if (resumeData.bookID !== bookID) return
    if (productIntroEntryRef.current) {
      resumePersonalization(null)
      return
    }

    const data = resumeData.personalization
    if (!data) return

    setName(data.childName || '')
    setAge(data.childAge || '')
    setSelectedLang(normalizeStoryLanguage(data.language))
    setBookType(normalizePurchasePackageType(data.bookType) ?? 'basic')
    setPhotoPreview(data.photoUrl || null)
    setPhotoAssetId(data.assetId || null)
    setPhotoStoragePath(data.storagePath || null)
    setFaceImageUrl(data.faceImageUrl || null)
    setFaceAutoCropped(false)
    setVoiceAssetId(data.voiceAssetId || null)
    setVoiceStoragePath(data.voiceStoragePath || null)
    setVoicePlaybackUrl(null)
    setVoiceDurationSeconds(null)
    pendingVoiceRecordingRef.current = null
    setPendingVoiceRecording(null)
    setPreviewJobId(isUuid(data.previewJobId) ? data.previewJobId : null)
    setCreationId(data.creationId ?? null)
    if (viewMode !== 'preview') {
      setFormStep(
        data.assetId || data.photo
          ? data.childName && data.childAge
            ? 'REVIEW'
            : 'DETAILS'
          : 'PHOTO'
      )
    }
    initializedPersonalizeDraftKeyRef.current = `${bookID}:${personalizeDraftOwnerKey}`
    setIsPersonalizeDraftReady(true)
    resumePersonalization(null)
  }, [resumeData, bookID, personalizeDraftOwnerKey, setName, setAge, setSelectedLang, setBookType, setPhotoPreview, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setVoiceAssetId, setVoiceStoragePath, setPreviewJobId, setCreationId, resumePersonalization, viewMode])

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
  }, [viewMode, creationId, previewPages.length, previewJobId, setPreviewJobId])

  useEffect(() => {
    if (viewMode !== 'preview') return
    if (!creationId) return
    if (stage === 'GENERATING') return

    let isActive = true
    const selectionRevision = editionSelectionRevisionRef.current
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
                if (canHydrateEdition(selectionRevision, editionSelectionRevisionRef.current)) {
                  if (nextType) setBookType(normalizePurchasePackageType(nextType) ?? 'basic')
                  const cachedVoiceAssetId = typeof creation.voice_asset_id === 'string'
                    ? creation.voice_asset_id
                    : null
                  setVoiceAssetId(cachedVoiceAssetId)
                  setVoiceDurationSeconds(
                    Number.isFinite(Number(creation.voice_sample_duration_seconds))
                      ? Number(creation.voice_sample_duration_seconds)
                      : null
                  )
                  setVoicePlaybackUrl(cachedVoiceAssetId
                    ? `/api/user-assets/${encodeURIComponent(cachedVoiceAssetId)}/download`
                    : null)
                }

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
                    setTemplateCoverUrl(templateStorageUrl(rawPath))
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
          selectPreviewJobId(activePreviewJobId)
          setPreviewJobId(activePreviewJobId)
          setPreviewPages([])
          setPreviewBookPresentation(null)
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
        if (canHydrateEdition(selectionRevision, editionSelectionRevisionRef.current)) {
          if (nextType) setBookType(normalizePurchasePackageType(nextType) ?? 'basic')
          const nextVoiceAssetId = typeof creation.voice_asset_id === 'string'
            ? creation.voice_asset_id
            : null
          setVoiceAssetId(nextVoiceAssetId)
          setVoiceDurationSeconds(
            Number.isFinite(Number(creation.voice_sample_duration_seconds))
              ? Number(creation.voice_sample_duration_seconds)
              : null
          )
          setVoicePlaybackUrl(nextVoiceAssetId
            ? `/api/user-assets/${encodeURIComponent(nextVoiceAssetId)}/download`
            : null)
        }

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
            setTemplateCoverUrl(templateStorageUrl(rawPath))
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
  // Creation hydration is identity-scoped, not a response to editing the form/edition.
  // Its late response must never overwrite a newer local purchase choice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, creationId, user?.customerId, previewJobId, stage, bookID, selectPreviewJobId, setPreviewBookPresentation, setPreviewJobId, setPreviewPages, setPreviewUrl, setPreviewVariants])

  useEffect(() => {
    if (!isHydrated) return
    if (!productIntroEntryRef.current && resumeData && resumeData.bookID === bookID) return
    if (
      viewMode === 'preview' &&
      (creationIdParam || creationId || previewJobIdParam || previewJobId)
    ) {
      return
    }
    if (stage === 'GENERATING' || stage === 'PREVIEW') {
      return
    }

    const draftKey = `${bookID}:${personalizeDraftOwnerKey}`
    if (initializedPersonalizeDraftKeyRef.current === draftKey) return
    initializedPersonalizeDraftKeyRef.current = draftKey

    setIsPersonalizeDraftReady(false)
    const draft = readPersonalizeFormDraft(
      window.sessionStorage,
      bookID,
      personalizeDraftOwnerKey
    )

    setFormStep(resolvePersonalizeEntryStep(draft, productIntroEntryRef.current))
    productIntroEntryRef.current = false
    setName(draft?.name ?? '')
    setAge(draft?.age ?? '')
    setSelectedLang(draft?.language ?? 'English')
    setBookType(draft?.bookType ?? 'basic')
    setPhoto(null)
    setPhotoPreview(null)
    setPhotoAssetId(draft?.faceAssetId ?? null)
    setPhotoStoragePath(draft?.faceStoragePath ?? null)
    setFaceImageUrl(null)
    setPreparedFaceFile(null)
    setFacePrepareStatus(draft?.faceAssetId ? 'ready' : 'idle')
    setFacePrepareError(null)
    setFaceAutoCropped(false)
    facePrepareRunIdRef.current += 1
    setTemplateCoverUrl(initialBook?.coverUrl || null)
    setTemplateTitle(initialBook?.title || null)
    setTemplateDescription(initialBook?.description || null)
    setTemplateInnerDescription(initialBook?.innerDescription || null)
    setVoiceAssetId(null)
    setVoiceStoragePath(null)
    setVoicePlaybackUrl(null)
    setVoiceDurationSeconds(null)
    pendingVoiceRecordingRef.current = null
    setPendingVoiceRecording(null)
    setVoiceValidationError(null)
    setPreviewJobId(null)
    setCreationId(null)
    setPreviewUrl(null)
    setPreviewPages([])
    setPreviewBookPresentation(null)
    setIsPersonalizeDraftReady(true)
  }, [bookID, creationId, creationIdParam, initialBook, isHydrated, personalizeDraftOwnerKey, previewJobId, previewJobIdParam, resumeData, setAge, setBookType, setCreationId, setFaceImageUrl, setName, setPhoto, setPhotoAssetId, setPhotoPreview, setPhotoStoragePath, setPreviewBookPresentation, setPreviewJobId, setPreviewPages, setPreviewUrl, setSelectedLang, setTemplateCoverUrl, setTemplateDescription, setTemplateInnerDescription, setTemplateTitle, setVoiceAssetId, setVoiceStoragePath, stage, viewMode])

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
    if (new URLSearchParams(window.location.search).get('source') === 'my-books') {
      params.set('source', 'my-books');
    }
    replacePersonalizeUrl(params);
  }, [replacePersonalizeUrl]);

  useEffect(() => {
    creationIdRef.current = creationId;
  }, [creationId]);

  useEffect(() => {
    previewJobIdRef.current = previewJobId;
  }, [previewJobId]);

  useEffect(() => {
    if (stage !== 'GENERATING') return;
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    previewCancelRequestedRef.current = false;

    let isActive = true;
    let watchedJobId: string | null = null;
    let watchedCreationId: string | null = null;
    setPreviewError(null);
    setGenerationStartedAt(Date.now());
    editionSelectionRevisionRef.current = 0;

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
        const currentName = nameRef.current
        const currentAge = ageRef.current

        if (!book) throw new Error('Book not found')
        if (!currentPhoto && !faceAssetId) throw new Error('Please upload a photo before generating the preview')
        if (!hasDataGenerationConsent) throw new Error(t('personalize.dataConsentRequired'))

        setPreviewUrl(null)
        setPreviewPages([])
        setPreviewBookPresentation(null)

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
          language: selectedLang,
          book_type: 'basic',
        }

        if (!faceAssetId) {
          throw new Error('Missing face asset for preview')
        }

        const generationConsentParams = {
          consent: {
            content_generation: {
              accepted: hasDataGenerationConsent,
              version: 'content-generation-consent-v1',
            },
          },
        }

        const created = await createPreviewJob(
          book.bookID,
          faceAssetId,
          textOverrides,
          generationConsentParams,
          currentCustomerId ?? undefined,
          pendingFaceAsset,
          undefined
        )
        markGenerateTiming(pendingFaceAsset ? 'asset_confirmed/job_created' : 'job_created', {
          jobId: created?.jobId,
          creationId: created?.creationId,
          usedPendingAsset: Boolean(pendingFaceAsset),
        })
        if (!created?.jobId) {
          throw new Error('Preview job missing jobId')
        }
        rememberProfile(created.textProfile?.profile)
        setBookType('basic')
        setVoiceAssetId(null)
        setVoiceStoragePath(null)
        setVoicePlaybackUrl(null)
        setVoiceDurationSeconds(null)
        pendingVoiceRecordingRef.current = null
        setPendingVoiceRecording(null)
        watchedJobId = created.jobId;
        watchedCreationId = created.creationId;
        if (pendingFaceAsset) {
          photoAssetIdRef.current = pendingFaceAsset.asset_id
          setPhotoAssetId(pendingFaceAsset.asset_id)
          setPhotoStoragePath(pendingFaceAsset.storage_path)
          void refreshPersonalizeHistory().catch(() => undefined)
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
        selectedPreviewCreationIdRef.current = null
        setPreviewJobId(created.jobId)
        selectPreviewJobId(created.jobId)
        setCreationId(created.creationId)
        replacePreviewUrl(created.creationId, created.jobId);
        if (!isActive) return

        const outcome = await watchPreviewJob(created.jobId, {
          until: 'cover',
          onAssets: (jobId, assets) => {
            if (!isActive) return;
            if (applyPreviewDisplayAssetsForJob(jobId, assets)) {
              trackPreviewReady(jobId);
            }
          },
        });
        if (!isActive) return;
        if (outcome.status === 'cancelled') throw new Error('This Preview was cancelled. Please try again.');
        if (!outcome.assets?.coverUrl) throw new Error('Preview cover could not be loaded.');

        replacePreviewUrl(created.creationId, created.jobId);
        await waitForImageDecode(outcome.assets.coverUrl);
        logPreviewDebug('finishGenerating', { jobId: created.jobId, mode: 'cover-ready' });
        if (!isActive) return;
        finishGenerating();
        return;
      } catch (error: unknown) {
        if (!isActive) return
        if (previewCancelRequestedRef.current) {
          return
        }
        const message = error instanceof Error ? error.message : 'Preview generation failed.'
        setPreviewError(message)
        if (watchedJobId && watchedCreationId) {
          replacePreviewUrl(watchedCreationId, watchedJobId)
          finishGenerating()
          return
        }
        replacePersonalizeUrl(null)
        reset()
      } finally {
        generationInFlightRef.current = false;
      }
    }

    run()

    return () => {
      isActive = false;
      cancelPreviewWatch(watchedJobId);
    };
  // State setters from usePersonalizeState are stable; keeping them out avoids dev-time dependency shape churn during preview generation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selectedLang, finishGenerating, book, user?.customerId, reset, replacePreviewUrl, replacePersonalizeUrl, t, trackPreviewReady, applyPreviewDisplayAssetsForJob, watchPreviewJob, rememberProfile, refreshPersonalizeHistory]);

  useEffect(() => {
    if (!viewState.showForm || !photoAssetId || photo || photoPreview) return
    if (personalizeHistoryStatus !== 'ready') return

    const persistedFace = recentFaces.find((face) => face.asset_id === photoAssetId)
    if (!persistedFace?.signed_url) {
      setPhotoAssetId(null)
      setPhotoStoragePath(null)
      setFaceImageUrl(null)
      setFacePrepareStatus('idle')
      if (formStep !== 'INTRO') setFormStep('PHOTO')
      return
    }

    setPhotoStoragePath(persistedFace.storage_path ?? null)
    setPhotoPreview(persistedFace.signed_url)
    setFaceImageUrl(persistedFace.signed_url)
    setFacePrepareStatus('ready')
  }, [
    formStep,
    personalizeHistoryStatus,
    photo,
    photoAssetId,
    photoPreview,
    recentFaces,
    setFaceImageUrl,
    setPhotoAssetId,
    setPhotoPreview,
    setPhotoStoragePath,
    viewState.showForm,
  ])

  useEffect(() => {
    if (voicePlaybackUrl) return;
    if (!currentVoiceSample?.playback_url) return;
    setVoicePlaybackUrl(currentVoiceSample.playback_url);
  }, [currentVoiceSample?.playback_url, voicePlaybackUrl]);

  useEffect(() => {
    if (!requiresVoiceSample || voiceAssetId || pendingVoiceRecording) {
      setVoiceValidationError(null);
    }
  }, [pendingVoiceRecording, requiresVoiceSample, voiceAssetId]);

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

  const resolvePreviewSpreadImages = useCallback((spreadIndex: number) => {
    if (spreadIndex <= 1) {
      return getPreviewSpreadUrls(previewDisplayState, spreadIndex);
    }
    const lockedSpread = lockedPreviewPresentation?.spreads.find(
      (spread) => (spread.displayIndex ?? spread.spreadIndex) === spreadIndex,
    );
    return [lockedSpread?.left?.url, lockedSpread?.right?.url]
      .filter((url): url is string => Boolean(url));
  }, [lockedPreviewPresentation, previewDisplayState]);

  useEffect(() => {
    if (!viewState.showPreview) return;

    getPreviewPreloadSpreadIndexes(currentSpread, maxSpreadIndex).forEach((spreadIndex) => {
      resolvePreviewSpreadImages(spreadIndex).forEach((url) => {
        preloadPreviewImage(url);
      });
    });
  }, [
    currentSpread,
    maxSpreadIndex,
    preloadPreviewImage,
    resolvePreviewSpreadImages,
    viewState.showPreview,
  ]);

  useEffect(() => {
    if (!viewState.showPreview) return;
    router.prefetch('/checkout');
  }, [router, viewState.showPreview]);

  // --- Handlers ---
  const handleDeleteFace = useCallback(async (assetId: string) => {
    try {
      const response = await fetch('/api/user-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          customerId: user?.customerId ?? null,
        }),
        credentials: 'include',
      });
      if (!response.ok) return

      forgetFace(assetId)
      if (photoAssetId === assetId) {
        setPhotoAssetId(null)
        setPhotoStoragePath(null)
        setFaceImageUrl(null)
        setPhotoPreview(null)
        setPhoto(null)
        setPreparedFaceFile(null)
        setFacePrepareStatus('idle')
        setFacePrepareError(null)
        setFaceAutoCropped(false)
        facePrepareRunIdRef.current += 1
      }
    } catch {
      // no-op
    }
  }, [forgetFace, photoAssetId, setFaceImageUrl, setPhoto, setPhotoAssetId, setPhotoPreview, setPhotoStoragePath, user?.customerId]);

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
      forgetProfile(payload)
    } catch {
      // no-op
    }
  }, [forgetProfile, user?.customerId]);

  const handleBack = () => {
    if (stage === 'GENERATING') {
      void requestPreviewCancellation();
      return;
    }
    if (!canBack) return

    if (viewState.showForm) {
      // Header Back exits the route. Step Back belongs only to FormFlow.
      router.push('/books')
      return
    }

    if (viewState.showPreview && previewSource === 'my-books') {
      void (async () => {
        try {
          await cleanupCurrentPreviewVariantSession()
        } finally {
          router.push('/my-books?shelf=previews')
        }
      })()
      return
    }

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

  const triggerCheckoutFailedToast = useCallback(() => {
    triggerPageToast(t('personalize.checkoutPrepareFailedToast'));
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
      cancelPreviewWatch(targetJobId);

      persistDraftForCustomizeReturn({ clearPreviewRefs: true });
      setPreviewError(null);
      setPreviewJobId(null);
      setCreationId(null);
      setPreviewUrl(null);
      setPreviewPages([]);
      setPreviewBookPresentation(null);
      setGenerationStartedAt(null);
      replacePersonalizeUrl(null);
      setFormStep('REVIEW');
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
      cancelPreviewWatch,
      creationId,
      persistDraftForCustomizeReturn,
      previewJobId,
      setCreationId,
      setPreviewBookPresentation,
      setPreviewJobId,
      setPreviewPages,
      setPreviewError,
      setPreviewUrl,
      replacePersonalizeUrl,
      triggerPreviewCancelledToast,
      user?.customerId,
      startForm,
    ]
  );

  useEffect(() => {
    if (stage !== 'GENERATING') return;
    if (typeof window === 'undefined') return;

    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get('view') !== 'preview') {
      currentParams.set('view', 'preview');
      const nextUrl = `/personalize/${bookID}?${currentParams.toString()}`;
      window.history.pushState({ ...window.history.state, ymiPersonalizeStage: 'preview' }, '', nextUrl);
    }

    const handlePopState = () => {
      const currentView = new URLSearchParams(window.location.search).get('view') || 'edit';
      if (currentView === 'preview') return;
      void requestPreviewCancellation();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [bookID, requestPreviewCancellation, stage]);

  const returnToCustomizeFromPreview = useCallback(async () => {
    persistDraftForCustomizeReturn();
    setShowExitConfirm(false);
    await cleanupCurrentPreviewVariantSession();
    router.replace(`/personalize/${bookID}`);
    setFormStep('REVIEW');
    startForm();
  }, [bookID, cleanupCurrentPreviewVariantSession, persistDraftForCustomizeReturn, router, startForm]);

  const leaveUnavailablePreview = useCallback(() => {
    cancelPreviewWatch(displayedPreviewJobId);
    router.replace('/books');
  }, [cancelPreviewWatch, displayedPreviewJobId, router]);

  const navigateAwayFromPreview = useCallback(async (href: string) => {
    if (stage === 'GENERATING') {
      await requestPreviewCancellation();
    } else if (viewState.showPreview) {
      await cleanupCurrentPreviewVariantSession();
    }
    if (isBrowserTranslated()) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  }, [cleanupCurrentPreviewVariantSession, requestPreviewCancellation, router, stage, viewState.showPreview]);

  const logoutFromPreview = useCallback(async () => {
    if (stage === 'GENERATING') {
      await requestPreviewCancellation();
    } else if (viewState.showPreview) {
      await cleanupCurrentPreviewVariantSession();
    }
    logout();
  }, [cleanupCurrentPreviewVariantSession, logout, requestPreviewCancellation, stage, viewState.showPreview]);

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
    setIsVoiceDialogOpen(true);
    return false;
  }, [requiresVoiceSample, voiceAssetId, t]);

  const handleVoiceRecordingSelected = useCallback(
    (recording: PendingVoiceRecording | null) => {
      pendingVoiceRecordingRef.current = recording;
      setPendingVoiceRecording(recording);
      if (!recording) return;
      setVoiceValidationError(null);
    },
    []
  );

  const resolvePurchaseConfigurationContext = useCallback(async () => {
    const locationParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
    const locationCreationId = locationParams?.get('creationId') ?? null;
    const locationPreviewJobId = locationParams?.get('jobId') ?? null;
    const ensuredCreationId =
      (creationIdRef.current && isUuid(creationIdRef.current) ? creationIdRef.current : null)
      || (locationCreationId && isUuid(locationCreationId) ? locationCreationId : null)
      || (creationIdParam && isUuid(creationIdParam) ? creationIdParam : null)
      || (await resolveCreationId());
    const expectedPreviewJobId = previewJobIdRef.current && isUuid(previewJobIdRef.current)
      ? previewJobIdRef.current
      : locationPreviewJobId && isUuid(locationPreviewJobId)
        ? locationPreviewJobId
      : previewJobIdParam && isUuid(previewJobIdParam)
        ? previewJobIdParam
        : null;

    if (!ensuredCreationId || !expectedPreviewJobId) {
      throw new Error(t('personalize.editionUnavailable'));
    }

    return { ensuredCreationId, expectedPreviewJobId };
  }, [creationIdParam, previewJobIdParam, resolveCreationId, t]);

  const reconcilePurchaseConfigurationIdentity = useCallback(async (
    expectedPreviewJobId: string
  ) => {
    if (!isUuid(expectedPreviewJobId)) return null;
    const url = user?.customerId
      ? `/api/creations/resolve?jobId=${encodeURIComponent(expectedPreviewJobId)}&customerId=${encodeURIComponent(user.customerId)}`
      : `/api/creations/resolve?jobId=${encodeURIComponent(expectedPreviewJobId)}`;

    try {
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      const nextCreationId = String(payload?.creationId ?? '').trim();
      const nextPreviewJobId = String(payload?.previewJobId ?? '').trim();
      if (!isUuid(nextCreationId) || !isUuid(nextPreviewJobId)) return null;

      creationIdRef.current = nextCreationId;
      previewJobIdRef.current = nextPreviewJobId;
      setCreationId(nextCreationId);
      setPreviewJobId(nextPreviewJobId);
      replacePreviewUrl(nextCreationId, nextPreviewJobId);
      return {
        ensuredCreationId: nextCreationId,
        expectedPreviewJobId: nextPreviewJobId,
      };
    } catch {
      return null;
    }
  }, [replacePreviewUrl, setPreviewJobId, user?.customerId]);

  const saveEditionConfiguration = useCallback(async (
    packageType: PurchasePackageType,
    options?: {
      voiceAssetId?: string | null
      clearVoice?: boolean
      signal?: AbortSignal
    }
  ) => {
    let identity = await resolvePurchaseConfigurationContext();
    const persist = async () => ({
      ...(await savePurchaseConfiguration({
        creationId: identity.ensuredCreationId,
        expectedPreviewJobId: identity.expectedPreviewJobId,
        packageType,
        voiceAssetId: options?.voiceAssetId,
        clearVoice: options?.clearVoice,
        customerId: user?.customerId ?? null,
        signal: options?.signal,
      })),
      creationId: identity.ensuredCreationId,
      previewJobId: identity.expectedPreviewJobId,
    });

    try {
      return await persist();
    } catch (error) {
      if (!isRecoverablePurchaseIdentityError(error) || options?.signal?.aborted) throw error;
      const reconciled = await reconcilePurchaseConfigurationIdentity(identity.expectedPreviewJobId);
      if (!reconciled) throw error;
      identity = reconciled;
      return persist();
    }
  }, [reconcilePurchaseConfigurationIdentity, resolvePurchaseConfigurationContext, user?.customerId]);

  const resolveEditionError = useCallback((error: unknown) => {
    if (error instanceof PurchaseConfigurationRequestError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return t('personalize.editionSaveFailed');
  }, [t]);

  const drainEditionConfigurationQueue = useCallback(async () => {
    setIsSavingEdition(true);
    try {
      while (queuedPurchaseBookTypeRef.current) {
        const requestedPackageType = queuedPurchaseBookTypeRef.current;
        queuedPurchaseBookTypeRef.current = null;

        try {
          const result = await saveEditionConfiguration(requestedPackageType, {
            voiceAssetId: requestedPackageType === 'supreme' ? voiceAssetIdRef.current : null,
          });
          confirmedPurchaseBookTypeRef.current = result.packageType;

          const isLatestSelection = (
            !queuedPurchaseBookTypeRef.current
            && purchaseBookTypeRef.current === requestedPackageType
          );
          if (!isLatestSelection) continue;

          purchaseBookTypeRef.current = result.packageType;
          setBookType(result.packageType);
          if (result.packageType !== 'supreme') {
            voiceAssetIdRef.current = null;
            setVoiceAssetId(null);
            setVoiceStoragePath(null);
            setVoicePlaybackUrl(null);
            setVoiceDurationSeconds(null);
            pendingVoiceRecordingRef.current = null;
            setPendingVoiceRecording(null);
            setIsVoiceDialogOpen(false);
          } else if (result.voiceReady && result.voiceAssetId) {
            voiceAssetIdRef.current = result.voiceAssetId;
            setVoiceAssetId(result.voiceAssetId);
          }
        } catch (error) {
          const isLatestSelection = (
            !queuedPurchaseBookTypeRef.current
            && purchaseBookTypeRef.current === requestedPackageType
          );
          if (!isLatestSelection) continue;

          const confirmedPackageType = confirmedPurchaseBookTypeRef.current;
          purchaseBookTypeRef.current = confirmedPackageType;
          setBookType(confirmedPackageType);
          setEditionError(resolveEditionError(error));
        }
      }
    } finally {
      setIsSavingEdition(false);
    }
  }, [resolveEditionError, saveEditionConfiguration, setBookType]);

  const handleEditionChange = useCallback((nextPackageType: PurchasePackageType) => {
    if (
      nextPackageType === purchaseBookTypeRef.current
      && !queuedPurchaseBookTypeRef.current
    ) {
      return purchaseConfigurationDrainPromiseRef.current ?? Promise.resolve();
    }

    purchaseBookTypeRef.current = nextPackageType;
    editionSelectionRevisionRef.current += 1;
    queuedPurchaseBookTypeRef.current = nextPackageType;
    setBookType(nextPackageType);
    setEditionError(null);
    setVoiceValidationError(null);

    if (!purchaseConfigurationDrainPromiseRef.current) {
      const drainPromise = drainEditionConfigurationQueue();
      const trackedPromise = drainPromise.finally(() => {
        if (purchaseConfigurationDrainPromiseRef.current === trackedPromise) {
          purchaseConfigurationDrainPromiseRef.current = null;
        }
      });
      purchaseConfigurationDrainPromiseRef.current = trackedPromise;
    }

    return purchaseConfigurationDrainPromiseRef.current;
  }, [drainEditionConfigurationQueue, setBookType]);

  const handleSaveVoice = useCallback(async (recording: PendingVoiceRecording) => {
    if (isSavingVoice) return;
    setIsSavingVoice(true);
    editionSelectionRevisionRef.current += 1;
    setVoiceValidationError(null);
    setEditionError(null);

    try {
      await purchaseConfigurationDrainPromiseRef.current;
      const voiceAsset = await uploadUserAsset(
        recording.file,
        'voice_sample',
        'voice',
        user?.customerId ?? undefined,
        {
          metadata: { duration_seconds: recording.durationSeconds },
          voiceAuthorization: {
            accepted: true,
            version: SIGNATURE_VOICE_CONSENT_VERSION,
            speakerKind: 'authorized_speaker',
          },
        }
      );
      const result = await saveEditionConfiguration('supreme', {
        voiceAssetId: voiceAsset.asset_id,
      });
      if (!result.voiceReady || !result.voiceAssetId) {
        throw new Error(t('personalize.voiceSaveFailed'));
      }

      purchaseBookTypeRef.current = 'supreme';
      confirmedPurchaseBookTypeRef.current = 'supreme';
      setBookType('supreme');
      voiceAssetIdRef.current = result.voiceAssetId;
      setVoiceAssetId(result.voiceAssetId);
      setVoiceStoragePath(voiceAsset.storage_path);
      setVoicePlaybackUrl(
        voiceAsset.playback_url
          ?? `/api/user-assets/${encodeURIComponent(result.voiceAssetId)}/download`
      );
      setVoiceDurationSeconds(
        Number(voiceAsset.metadata?.duration_seconds) || recording.durationSeconds
      );
      pendingVoiceRecordingRef.current = null;
      setPendingVoiceRecording(null);
      setIsVoiceDialogOpen(false);
      void refreshPersonalizeHistory().catch(() => {});
    } catch (error) {
      setVoiceValidationError(resolveEditionError(error));
    } finally {
      setIsSavingVoice(false);
    }
  }, [isSavingVoice, refreshPersonalizeHistory, resolveEditionError, saveEditionConfiguration, setBookType, t, user?.customerId]);

  const handleRemoveVoice = useCallback(async () => {
    if (isSavingVoice) return;
    editionSelectionRevisionRef.current += 1;
    setIsSavingVoice(true);
    setVoiceValidationError(null);
    try {
      await purchaseConfigurationDrainPromiseRef.current;
      await saveEditionConfiguration('supreme', { clearVoice: true });
      voiceAssetIdRef.current = null;
      setVoiceAssetId(null);
      setVoiceStoragePath(null);
      setVoicePlaybackUrl(null);
      setVoiceDurationSeconds(null);
      pendingVoiceRecordingRef.current = null;
      setPendingVoiceRecording(null);
    } catch (error) {
      setVoiceValidationError(resolveEditionError(error));
    } finally {
      setIsSavingVoice(false);
    }
  }, [isSavingVoice, resolveEditionError, saveEditionConfiguration]);

  const ensureCurrentPurchaseConfiguration = useCallback(async () => {
    setEditionError(null);
    await purchaseConfigurationDrainPromiseRef.current;
    const selectedPackageType = purchaseBookTypeRef.current;
    setIsSavingEdition(true);
    try {
      const result = await saveEditionConfiguration(selectedPackageType, {
        voiceAssetId: selectedPackageType === 'supreme' ? voiceAssetIdRef.current : null,
      });
      confirmedPurchaseBookTypeRef.current = result.packageType;
      if (selectedPackageType === 'supreme' && !result.voiceReady) {
        setVoiceValidationError(t('personalize.voiceSampleRequired'));
        setIsVoiceDialogOpen(true);
        return null;
      }
      return result;
    } catch (error) {
      setEditionError(resolveEditionError(error));
      return null;
    } finally {
      setIsSavingEdition(false);
    }
  }, [resolveEditionError, saveEditionConfiguration, t]);

  const handleDiscardPreviewVariant = useCallback(async (jobId: string) => {
    const variant = previewVariantsRef.current.find((item) => item.jobId === jobId);
    const variantSessionId = previewVariantSessionIdRef.current;
    if (!variant || variant.original || !creationId || !variantSessionId) return;

    cancelPreviewWatch(jobId);
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
  }, [applyPreviewVariantSelection, cancelPreviewWatch, creationId, selectedPreviewJobId, setPreviewVariants, t]);

  const commitSelectedPreviewForExit = useCallback(async (ensuredCreationId: string) => {
    const expectedPreviewJobId = previewJobId;
    const selectedJobId = selectedPreviewJobId ?? expectedPreviewJobId;
    if (!expectedPreviewJobId || !selectedJobId) {
      throw new Error('Preview selection is unavailable');
    }

    const variantSessionId = previewVariantSessionIdRef.current;
    const committedSelection = committedPreviewSelectionRef.current;
    if (
      committedSelection?.creationId === ensuredCreationId &&
      committedSelection.selectedPreviewJobId === selectedJobId
    ) {
      return committedSelection.activePreviewJobId;
    }

    const commitKey = [
      ensuredCreationId,
      expectedPreviewJobId,
      selectedJobId,
      variantSessionId ?? '',
    ].join(':');
    const currentCommit = previewCommitInFlightRef.current;
    const commitPromise = currentCommit?.key === commitKey
      ? currentCommit.promise
      : commitPreviewVariant({
          creationId: ensuredCreationId,
          expectedPreviewJobId,
          selectedPreviewJobId: selectedJobId,
          variantSessionId,
        });

    if (currentCommit?.key !== commitKey) {
      previewCommitInFlightRef.current = { key: commitKey, promise: commitPromise };
    }

    try {
      const result = await commitPromise;
      const settledSelection = committedPreviewSelectionRef.current;
      if (
        settledSelection?.creationId === ensuredCreationId &&
        settledSelection.selectedPreviewJobId === selectedJobId
      ) {
        return settledSelection.activePreviewJobId;
      }

      committedPreviewSelectionRef.current = {
        creationId: ensuredCreationId,
        selectedPreviewJobId: selectedJobId,
        activePreviewJobId: result.activePreviewJobId,
      };

      setPreviewJobId(result.activePreviewJobId);
      selectPreviewJobId(result.activePreviewJobId);
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
              coverUrl: selectedVariant?.coverUrl ?? previewUrl ?? previewPages[0] ?? null,
              jobId: result.activePreviewJobId,
            })
          );
        } catch {
          // Cache refresh is optional after the database commit succeeds.
        }
      }

      void refreshPreviewImages('commit', { force: true });

      return result.activePreviewJobId;
    } finally {
      if (previewCommitInFlightRef.current?.promise === commitPromise) {
        previewCommitInFlightRef.current = null;
      }
    }
  }, [previewJobId, previewPages, previewUrl, refreshPreviewImages, replacePreviewUrl, selectPreviewJobId, selectedPreviewJobId, setPreviewJobId, setPreviewVariants]);


  const performAddToCart = useCallback(async () => {
    if (!canAddToCart) return null
    if (!resolvedBook) return null
    if (!ensurePremiumVoiceSample()) return null
    const purchaseConfiguration = await ensureCurrentPurchaseConfiguration()
    if (!purchaseConfiguration) return null
    const currentName = nameRef.current
    const currentAge = ageRef.current
    const parsedAge = Number.parseInt(currentAge, 10)

    const ensuredCreationId = purchaseConfiguration.creationId

    const committedPreviewJobId = await commitSelectedPreviewForExit(ensuredCreationId)

    const item = await addToCart(
        resolvedBook!,
        {
        childName: currentName,
        childAge: currentAge,
        language: selectedLang,
        bookType,
        photoUrl: photoPreview ?? undefined,
        assetId: photoAssetId ?? undefined,
        storagePath: photoStoragePath ?? undefined,
        faceImageUrl: faceImageUrl ?? undefined,
        textOverrides: {
          child_name: currentName,
          child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
          language: selectedLang,
          book_type: bookType,
        },
        voiceAssetId: voiceAssetId ?? undefined,
        voiceStoragePath: voiceStoragePath ?? undefined,
        previewJobId: committedPreviewJobId,
        creationId: ensuredCreationId ?? undefined,
        },
        savedStep,
        undefined,
        previewUrl || previewPages[0] || undefined
    )

    if (item) {
      const format = resolveTrackingFormat([
        { bookType: item.personalization?.bookType ?? bookType },
      ]);
      emitYmiTrackingEvent('add_to_cart', format ? { format } : {});
    }

    return item ?? null;
    }, [canAddToCart, resolvedBook, addToCart, selectedLang, bookType, savedStep, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, voiceAssetId, voiceStoragePath, previewPages, previewUrl, ensurePremiumVoiceSample, ensureCurrentPurchaseConfiguration, commitSelectedPreviewForExit]);

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
        if (!canCheckout) return false
        if (checkoutInFlightRef.current) return false
        if (!ensurePremiumVoiceSample()) return false
        const purchaseConfiguration = await ensureCurrentPurchaseConfiguration()
        if (!purchaseConfiguration) return false
        checkoutInFlightRef.current = true
        setCheckoutTransitionPhase('securing')

        try {
        if (resolvedBook) {
    const currentName = nameRef.current
    const currentAge = ageRef.current
    const parsedAge = Number.parseInt(currentAge, 10)
    const ensuredCreationId = purchaseConfiguration.creationId
            const committedPreviewJobId = await commitSelectedPreviewForExit(ensuredCreationId)
            const personalization = {
              childName: currentName,
              childAge: currentAge,
              language: selectedLang,
              bookType,
              photoUrl: photoPreview ?? undefined,
              assetId: photoAssetId ?? undefined,
              storagePath: photoStoragePath ?? undefined,
              faceImageUrl: faceImageUrl ?? undefined,
              textOverrides: {
                child_name: currentName,
                child_age: Number.isNaN(parsedAge) ? currentAge : parsedAge,
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
            const quantity = existingItem?.quantity ?? 1
            const payload = {
              customerId: user?.customerId ?? null,
              items: [
                {
                  cartItemId: existingItem?.id ?? null,
                  creationId: ensuredCreationId ?? null,
                  quantity,
                  dedicationAcknowledgement: dedicationAcknowledgementRef.current,
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
              const failure = await response.json().catch(() => null)
              throw new Error(typeof failure?.error === 'string' ? failure.error : 'Unable to prepare checkout')
            }

            const data = await response.json()
            const cartItemId = Array.isArray(data?.cartItemIds) ? data.cartItemIds[0] : existingItem?.id
            const orderId = typeof data?.orderId === 'string' ? data.orderId : null
            const authoritativeItem = Array.isArray(data?.items) ? data.items[0] : null
            const authoritativePrice = Number(authoritativeItem?.priceAtPurchase)
            if (!Number.isFinite(authoritativePrice) || authoritativePrice <= 0) {
              throw new Error('Checkout price could not be verified')
            }
            const checkoutPreviewCoverUrl = String(
              previewUrl || previewPages[0] || ''
            ).trim()
            const checkoutBook = {
              ...(existingItem?.book ?? resolvedBook),
              coverUrl: checkoutPreviewCoverUrl,
            }
            const checkoutItem = existingItem ? {
              ...existingItem,
              book: checkoutBook,
              coverStatus: checkoutPreviewCoverUrl ? 'ready' as const : 'pending' as const,
              priceAtPurchase: authoritativePrice,
            } : {
              id: cartItemId,
              bookID: resolvedBook.bookID,
              quantity,
              book: checkoutBook,
              coverStatus: checkoutPreviewCoverUrl ? 'ready' as const : 'pending' as const,
              personalization,
              savedStep,
              priceAtPurchase: authoritativePrice,
              creationId: ensuredCreationId ?? undefined,
            }

            if (!checkoutItem?.id) throw new Error('Checkout item could not be prepared')

            setCheckoutTransitionPhase('opening')
            prepareCheckout([checkoutItem])
            router.push(orderId ? `/checkout?orderId=${orderId}` : '/checkout')
            return true
        }
        return false
        } finally {
          checkoutInFlightRef.current = false
        }
    }, [canCheckout, resolvedBook, selectedLang, bookType, photoPreview, photoAssetId, photoStoragePath, faceImageUrl, voiceAssetId, voiceStoragePath, savedStep, prepareCheckout, router, cart, user?.customerId, ensurePremiumVoiceSample, ensureCurrentPurchaseConfiguration, commitSelectedPreviewForExit, previewPages, previewUrl]);

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

  const startPreviewCheckout = () => {
    if (isExiting) return;
    if (previewActionInFlightRef.current) return;
    if (!ensurePremiumVoiceSample()) return;
    setShowAddToCartConfirm(false);
    previewActionInFlightRef.current = 'CHECKOUT';
    setPreviewActionPending('CHECKOUT');
    setCheckoutTransitionPhase('preparing');
    requestCheckout();
  };

  const handleCheckoutClick = async () => {
    if (isExiting || previewActionInFlightRef.current || dedicationRequestInFlightRef.current) return;
    dedicationRequestInFlightRef.current = true;
    try {
      const acknowledgement = await dedicationRef.current?.ensureDecision();
      if (!acknowledgement) return;
      dedicationAcknowledgementRef.current = acknowledgement;
      if (creationId) rememberDedicationAcknowledgement(creationId, acknowledgement);
      startPreviewCheckout();
    } finally { dedicationRequestInFlightRef.current = false; }
  };

  const handleArrivalDedicationChoice = (acknowledgement: DedicationAcknowledgement) => {
    dedicationAcknowledgementRef.current = acknowledgement;
    if (creationId) rememberDedicationAcknowledgement(creationId, acknowledgement);
    if (dedicationReturnTo === 'cart' && creationId) {
      router.push('/cart');
    }
    else if (dedicationPurchaseOnArrival) startPreviewCheckout();
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
    if (checkoutTransitionPhase !== 'opening') return;
    const timeout = window.setTimeout(() => {
      setCheckoutTransitionPhase(null);
      triggerCheckoutFailedToast();
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [checkoutTransitionPhase, triggerCheckoutFailedToast]);

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
            if (!await performCheckout()) throw new Error('Checkout could not be prepared')
            break
          case 'EXIT':
            await returnToCustomizeFromPreview()
            break
        }
        completeExit()
        } catch {
        if (exitIntent === 'CHECKOUT') {
          setCheckoutTransitionPhase(null)
          triggerCheckoutFailedToast()
        }
        failExit()
        } finally {
        exitRunningRef.current = false;
        }
    }

    run()
    }, [exitPhase, exitIntent, completeExit, failExit, performCheckout, returnToCustomizeFromPreview, triggerCheckoutFailedToast])




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
          presentation: null,
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

        const outcome = await watchPreviewJob(created.jobId, { until: 'cover' });
        if (outcome.status === 'cancelled' || !outcome.assets?.coverUrl) {
          setPreviewVariants((current) => current.map((item) =>
            item.jobId === created.jobId
              ? { ...item, status: 'failed', countsTowardLimit: false }
              : item
          ));
          setPreviewVariantSessionCount((count) => Math.max(0, count - 1));
          return;
        }

        await waitForImageDecode(outcome.assets.coverUrl);
        const readyVariant: PreviewVariantView = {
          ...candidate,
          status: 'ready',
          pages: outcome.assets.urls,
          presentation: outcome.assets.presentation,
          coverUrl: outcome.assets.coverUrl,
        };
        setPreviewVariants((current) => current.map((item) =>
          item.jobId === created.jobId ? readyVariant : item
        ));
        applyPreviewVariantSelection(readyVariant);
        return;
      } catch (error) {
        if (insertedJobId) {
          setPreviewVariants((current) => current.map((item) =>
            item.jobId === insertedJobId
              ? { ...item, status: 'failed', countsTowardLimit: false }
              : item
          ));
          setPreviewVariantSessionCount((count) => Math.max(0, count - 1));
        } else {
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
      watchPreviewJob,
      ensurePreviewVariantSession,
      previewJobId,
      previewVariantSessionCount,
      resolvePreviewVariantError,
      setPreviewVariants,
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

  useEffect(() => {
    if (!isHydrated || !isPersonalizeDraftReady || stage !== 'FORM') return
    writePersonalizeFormDraft(window.sessionStorage, bookID, {
      version: 1,
      ownerKey: personalizeDraftOwnerKey,
      step: formStep,
      name,
      age,
      language: selectedLang,
      bookType,
      faceAssetId: photoAssetId,
      faceStoragePath: photoStoragePath,
    })
  }, [
    age,
    bookID,
    bookType,
    formStep,
    isHydrated,
    isPersonalizeDraftReady,
    name,
    personalizeDraftOwnerKey,
    photoAssetId,
    photoStoragePath,
    selectedLang,
    stage,
  ])



  // --- Flip Logic ---
  const turnPage = (direction: 'next' | 'prev') => {
      if (isFlipping) return;
      if (direction === 'next' && currentSpread >= maxSpreadIndex) return;
      if (direction === 'prev' && currentSpread <= 0) return;

      const targetSpread = direction === 'next' ? currentSpread + 1 : currentSpread - 1;
      resolvePreviewSpreadImages(targetSpread).forEach(preloadPreviewImage);
      resolvePreviewSpreadImages(targetSpread + 1).forEach(preloadPreviewImage);

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
    const failedIdentity = previewImageIdentity(imageUrl);
    if (
      firstPreviewSpreadPairKey
      && (
        (firstPreviewSpreadLeftUrl && previewImageIdentity(firstPreviewSpreadLeftUrl) === failedIdentity)
        || (firstPreviewSpreadRightUrl && previewImageIdentity(firstPreviewSpreadRightUrl) === failedIdentity)
      )
    ) {
      firstSpreadDecodeFailureRef.current = firstPreviewSpreadPairKey;
      setDecodedFirstSpreadPairKey(null);
    }
    markPreviewImageError(imageUrl);
    if (options?.refreshGenerated) {
      void refreshPreviewImages('image-error', { force: true });
    }
  }, [
    firstPreviewSpreadLeftUrl,
    firstPreviewSpreadPairKey,
    firstPreviewSpreadRightUrl,
    markPreviewImageError,
    refreshPreviewImages,
  ]);

  const renderPageContent = (side: 'left' | 'right', spreadIndex: number) => (
    <PreviewBookPageContent
      side={side}
      spreadIndex={spreadIndex}
      previewImageErrors={previewImageErrors}
      bookPresentation={visiblePreviewPresentation}
      firstPreviewSpreadReady={isFirstPreviewSpreadPairReady}
      lockedPreviewPresentation={lockedPreviewPresentation}
      currentSpread={currentSpread}
      isFlipping={isFlipping}
      canTurnNext={currentSpread < maxSpreadIndex}
      canTurnPrev={currentSpread > 0}
      resolvedTitle={resolvedBook?.title || book?.title || t('personalize.preview')}
      labels={{
        previewAlt: t('personalize.preview'),
        previewPageStillCreating: t('personalize.previewPageStillCreating'),
        previewPageLocked: t('personalize.previewPageLocked'),
        backToCover: t('personalize.backToCover'),
        nextPage: t('personalize.nextPage'),
        previousPage: t('personalize.previousPage'),
      }}
      onImageError={handlePreviewBookImageError}
      onTurnPage={turnPage}
      onReturnToCover={returnToPreviewCover}
    />
  );
  const isFacePreparing = facePrepareStatus === 'checking' || facePrepareStatus === 'preparing';
  const hasUsablePhoto = Boolean(
    (photoAssetId && photoPreview)
    || (photo && preparedFaceFile && facePrepareStatus === 'ready')
  );
  const isFormReady = areChildDetailsReady && hasUsablePhoto && !isFacePreparing && facePrepareStatus !== 'failed';
  const fromPrice = book
    ? Math.min(
        getBookPackagePrice(book, 'basic').effectivePriceUsd,
        getBookPackagePrice(book, 'supreme').effectivePriceUsd,
      )
    : 0;
  const editionOptions = book ? [
    {
      value: 'basic' as const,
      title: t('personalize.bookTypeBasicTitle'),
      subtitle: t('personalize.bookTypeBasicSubtitle'),
      image: '/personalize-editions/classic-portrait.svg',
      imageAlt: t('personalize.editionBasicImageAlt'),
      price: formatDisplayCurrency(getBookPackagePrice(book, 'basic').effectivePriceUsd, displayCurrency),
    },
    {
      value: 'supreme' as const,
      title: t('personalize.bookTypeSupremeTitle'),
      subtitle: t('personalize.bookTypeSupremeSubtitle'),
      image: '/personalize-editions/signature-voice.svg',
      imageAlt: t('personalize.editionSupremeImageAlt'),
      price: formatDisplayCurrency(getBookPackagePrice(book, 'supreme').effectivePriceUsd, displayCurrency),
      badge: t('personalize.mostPopular'),
    },
  ] : [];
  useEffect(() => {
    if (!viewState.showForm || formStep === 'INTRO') return;
    // A confirmed face draft restores its fresh signed URL asynchronously. Do
    // not demote the saved Details step during that owner-scoped lookup; the
    // history resolver below moves to Photo if the asset is truly unavailable.
    if (photoAssetId && !photoPreview && personalizeHistoryStatus !== 'error') return;
    if (!hasUsablePhoto && !isFacePreparing && formStep !== 'PHOTO' && formStep !== 'REVIEW') {
      setFormStep('PHOTO');
      return;
    }
  }, [formStep, hasUsablePhoto, isFacePreparing, personalizeHistoryStatus, photoAssetId, photoPreview, viewState.showForm]);

  const isAgeBelowRecommendedRange = useCallback((value: string) => {
    const parsedAge = parseChildAge(value);
    return parsedAge !== null && parsedAge < minimumRecommendedAge;
  }, [minimumRecommendedAge]);

  const startGeneratePreview = useCallback((consent: GeneratePreviewConsent) => {
    dataGenerationConsentRef.current = consent.dataGeneration;
    primaryAction();
  }, [primaryAction]);

  const handleGeneratePreviewAction = useCallback((consent: GeneratePreviewConsent) => {
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
        {t('common.unknown')}
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
  return (
    <div className="page-surface min-h-screen flex flex-col font-sans relative z-20">
      <PersonalizeOverlays
        showFlyAnimation={showFlyAnimation}
        flyAnimationId={flyAnimationId}
        flyOrigin={flyOrigin}
        flyTarget={flyTarget}
        flyCoverUrl={previewUrl || previewPages[0] || book.coverUrl}
        toastMessage={pageToastMessage}
        showExitConfirm={showExitConfirm}
        showAgeRangeConfirm={showAgeRangeConfirm}
        showAddToCartConfirm={showAddToCartConfirm}
        checkoutTransitionPhase={checkoutTransitionPhase}
        checkoutTransitionLabels={{
          preparing: t('personalize.checkoutTransitionPreparing'),
          securing: t('personalize.checkoutTransitionSecuring'),
          opening: t('personalize.checkoutTransitionOpening'),
          body: t('personalize.checkoutTransitionBody'),
        }}
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
        user={user}
        cartCount={cartCount}
        cartItems={cart}
        displayCurrency={displayCurrency}
        isCartHydrated={isHydrated}
        cartButtonRef={cartIconRef}
        labels={{
          back: t('common.back'),
          logIn: t('navbar.logIn'),
        }}
        onBack={handleBack}
        onUpdateCartQuantity={updateCartQuantity}
        onRemoveCartItem={removeFromCart}
        onViewCart={() => void navigateAwayFromPreview(
          stage === 'PREVIEW'
            ? buildPreviewCartHref({
                bookId: bookID,
                creationId: creationId ?? '',
                committedPreviewJobId: previewJobId ?? '',
              })
            : '/cart'
        )}
        onNavigate={(path) => void navigateAwayFromPreview(path)}
        onLoginClick={() => openLoginModal()}
        onLogoutClick={() => void logoutFromPreview()}
      />

      {/* Main Content */}
      <main className="relative mx-auto w-full max-w-full flex-grow overflow-hidden px-4 py-6 md:container md:py-7">
        
        {!viewState.showPreview ? (
          <ProgressSteps
            currentIndex={currentProgressIndex}
            labels={{
              story: t('personalize.stepStory'),
              customize: t('personalize.stepCustomize'),
              preview: t('personalize.stepPreview'),
              order: t('personalize.stepOrder'),
            }}
          />
        ) : null}

        {/* Step 1 (Skipped logic) */}


            {/* Step 2: The Rich Form */}
            {viewState.showForm && (
              <CustomizeFormLayout
                showcase={
                  <StoryShowcaseCard
                    carousel={
                      <ProductShowcaseCarousel
                        key={bookID}
                        title={templateTitle || book.title}
                        coverUrl={resolvedBook?.coverUrl}
                        images={resolvedBook?.showcaseImages}
                        isMobile={isMobile}
                      />
                    }
                    storyInfo={
                      <MagicAttributesPanel
                        attributes={magicAttributes}
                        heading={t('personalize.magicAttributes')}
                        translateAttribute={t}
                      />
                    }
                  />
                }
                form={
                  <div ref={uploadPanelRef} className="scroll-mt-5">
                    {formStep === 'INTRO' ? (
                      <PersonalizeProductIntro
                        key={bookID}
                        eyebrow={t('personalize.productEyebrow')}
                        title={templateTitle || book.title}
                        description={resolvedBook?.innerDescription || resolvedBook?.description || book.description}
                        readMoreLabel={t('personalize.readMore')}
                        readLessLabel={t('personalize.readLess')}
                        facts={[
                          { icon: 'age', label: t('personalize.productFactAge', { ageRange: book.ageLabel ?? `${minimumRecommendedAge}+` }) },
                          { icon: 'personalized', label: t('personalize.productFactPersonalized') },
                          { icon: 'preview', label: t('personalize.productFactPreview') },
                          { icon: 'formats', label: t('personalize.productFactFormats') },
                        ]}
                        fromLabel={t('personalize.fromPrice')}
                        priceLabel={formatDisplayCurrency(fromPrice, displayCurrency)}
                        ctaLabel={t('personalize.personalizeThisBook')}
                        faqHeading={t('personalize.aboutThisStory')}
                        faqItems={bookFaqItems}
                        onStart={handleStartPersonalization}
                      />
                    ) : (
                      <PersonalizeFormFlow
                        step={formStep}
                        photoPreview={photoPreview}
                        hasUsablePhoto={hasUsablePhoto}
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
                        onLoadProfiles={() => {
                          if (personalizeHistoryStatus === 'idle' || personalizeHistoryStatus === 'error') {
                            void refreshPersonalizeHistory().catch(() => undefined)
                          }
                        }}
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
                        isDetailsReady={areChildDetailsReady}
                        isFormReady={isFormReady}
                        isFacePreparing={isFacePreparing}
                        isPhotoFailed={facePrepareStatus === 'failed'}
                        previewError={previewError}
                        labels={{
                          photoTitle: t('personalize.photoStepTitle'),
                          photoBody: t('personalize.photoStepBody'),
                          detailsTitle: t('personalize.detailsStepTitle'),
                          detailsBody: t('personalize.detailsStepBody'),
                          reviewTitle: t('personalize.reviewStepTitle'),
                          reviewBody: t('personalize.reviewStepBody'),
                          stepLabel: (current) => t('personalize.microStep', { current }),
                          continue: t('personalize.continue'),
                          reviewDetails: t('personalize.reviewDetails'),
                          back: t('common.back'),
                          edit: t('personalize.edit'),
                          photoSummary: t('personalize.photoSummary'),
                          detailsSummary: t('personalize.detailsSummary'),
                          languageSummary: t('personalize.languageSummary'),
                          acknowledgement: t('personalize.generationAcknowledgement'),
                          privacyPolicy: t('personalize.privacyPolicy'),
                          required: t('personalize.requiredLabel'),
                          photoPreparing: t('personalize.photoPreparing'),
                          photoNeedsFix: t('personalize.photoNeedsFix'),
                          dataConsentRequiredShort: t('personalize.dataConsentRequiredShort'),
                          generateMagicPreview: t('personalize.generateMagicPreview'),
                          completeDetails: t('personalize.completeDetails'),
                        }}
                        onStepChange={handleFormStepChange}
                        onGenerate={handleGeneratePreviewAction}
                      />
                    )}
                  </div>
                }
              />
            )}

            {/* Step 3: Preview */}
            {viewState.showPreview && (
                <PreviewStepLayout
                  progress={
                    <ProgressSteps
                      placement="preview"
                      currentIndex={currentProgressIndex}
                      labels={{
                        story: t('personalize.stepStory'),
                        customize: t('personalize.stepCustomize'),
                        preview: t('personalize.stepPreview'),
                        order: t('personalize.stepOrder'),
                      }}
                    />
                  }
                  intro={
                    <PreviewIntroHeader
                      title={isPreviewUnavailable
                        ? t('personalize.previewUnavailableTitle')
                        : isPreviewRestoring
                        ? t('personalize.previewRestoringTitle')
                        : t('personalize.previewTitle', { name })}
                      subtitle={isPreviewUnavailable
                        ? t('personalize.previewUnavailableBody')
                        : isPreviewRestoring
                        ? t('personalize.previewRestoringBody')
                        : t('personalize.previewSubtitle')}
                      statusMessage={hasReadyPreviewCover && isRetryingPreview
                        ? t('personalize.previewRetrying')
                        : isPreviewPartialFailure && hasReadyPreviewCover
                          ? t(canRetryPreview
                            ? 'personalize.previewPartialFailureRetry'
                            : 'personalize.previewPartialFailure')
                          : null}
                      statusActionLabel={canRetryPreview || isRetryingPreview
                        ? t('personalize.previewRetryRemaining')
                        : null}
                      statusActionPendingLabel={t('personalize.previewRetrying')}
                      statusActionPending={isRetryingPreview}
                      onStatusAction={canRetryPreview || isRetryingPreview
                        ? () => void retryPreview(creationId)
                        : null}
                      changePhotoLabel={t('personalize.changePhoto')}
                      busyLabel={t('personalize.previewVariantPreparing')}
                      showChangePhoto={!isPreviewPhotoLocked && !isPreviewCoverPending}
                      changePhotoDisabled={isPreviewVariantBusy || isPreviewVariantLimitReached}
                      changePhotoBusy={isPreviewVariantBusy}
                      changePhotoError={previewVariantError}
                      capacityWaiting={isPreviewVariantCapacityWaiting}
                      capacityTitle={t('personalize.capacityPhotoTitle')}
                      capacityBody={t('personalize.capacityPhotoBody')}
                      onPhotoUpload={handlePhotoUpload}
                    />
                  }
                  book={
                    <PreviewBookStage
                      key={displayedPreviewJobId ?? 'preview-book'}
                      pendingContent={isPreviewCoverPending ? (
                        isPreviewUnavailable ? (
                          <PreviewAccessCover
                            mode="unavailable"
                            title={t('personalize.previewUnavailableTitle')}
                            body={t('personalize.previewUnavailableBody')}
                            actionLabel={t('personalize.previewUnavailableAction')}
                            onAction={leaveUnavailablePreview}
                          />
                        ) : isPreviewRestoring && !previewError ? (
                          <PreviewAccessCover
                            mode="restoring"
                            title={t('personalize.previewRestoringTitle')}
                            body={t('personalize.previewRestoringBody')}
                          />
                        ) : (
                          <PreviewGeneratingCover
                            startedAt={generationStartedAt}
                            title={t('personalize.generatingCoverTitle')}
                            body={t('personalize.generatingCoverBody')}
                            estimateLabel={t('personalize.generatingCoverEstimate')}
                            stillWorking={t('personalize.generatingCoverOverrun')}
                            error={previewError}
                            actionLabel={canRetryPreview
                              ? t('personalize.previewRetryRemaining')
                              : t('personalize.returnToCustomize')}
                            actionPendingLabel={t('personalize.previewRetrying')}
                            actionPending={isRetryingPreview}
                            onReturnToDetails={canRetryPreview
                              ? () => void retryPreview(creationId)
                              : () => void requestPreviewCancellation({ showToast: false })}
                            capacityWaiting={isGeneratingPreviewCapacityWaiting}
                            capacityTitle={t('personalize.capacityLoadingTitle')}
                            capacityBody={t('personalize.capacityLoadingBody')}
                          />
                        )
                      ) : undefined}
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
                      renderPageContent={renderPageContent}
                    />
                  }
                  gallery={
                    !isPreviewPhotoLocked && !isPreviewCoverPending ? (
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
                  purchase={
                    <PreviewPurchasePanel
                      value={purchaseBookType}
                      options={editionOptions}
                      title={t('personalize.bookType')}
                      voiceTitle={t('personalize.signatureVoiceTitle')}
                      voiceBody={t('personalize.signatureVoiceBody')}
                      voiceReadyLabel={t('personalize.voiceReady')}
                      addVoiceLabel={t('personalize.addYourVoice')}
                      changeVoiceLabel={t('personalize.changeVoice')}
                      privacyCopy={PRIVACY_REASSURANCE_COPY}
                      isSavingEdition={isSavingEdition}
                      selectionDisabled={!previewCompletionReady || Boolean(previewError) || isSavingVoice}
                      editionError={editionError}
                      voiceReady={Boolean(voiceAssetId)}
                      voiceDurationSeconds={resolvedVoiceDurationSeconds}
                      onChange={handleEditionChange}
                      onOpenVoice={() => setIsVoiceDialogOpen(true)}
                      dedication={previewCompletionReady ? <PreviewDedication
                        ref={dedicationRef}
                        creationId={creationId}
                        bookID={bookID}
                        childName={name}
                        openOnArrival={dedicationOnArrival}
                        onArrivalChoice={handleArrivalDedicationChoice}
                      /> : null}
                      actions={
                        <PreviewActionBar
                          acknowledgementLabel={t('personalize.checkoutAcknowledgement')}
                          acknowledgementRequiredLabel={t('personalize.checkoutAcknowledgementRequired')}
                          shareLabel={isPreparingShare ? t('common.loading') : t('share.previewButton')}
                          addToCartLabel={requiresVoiceSample && !voiceAssetId
                            ? t('personalize.addVoiceToContinue')
                            : t('personalize.addToCart')}
                          purchaseLabel={t('personalize.purchaseNow')}
                          loadingLabel={t('common.loading')}
                          shareError={shareError}
                          canShare={Boolean(creationId) && !isPreviewCoverPending && !previewError}
                          previewReady={Boolean(canAddToCart && canCheckout)}
                          isPreparingShare={isPreparingShare}
                          isCheckoutPending={previewActionPending === 'CHECKOUT'}
                          isConfigurationPending={isSavingEdition}
                          onShare={handleOpenPreviewShare}
                          onAddToCart={handleAddToCartClick}
                          onCheckout={handleCheckoutClick}
                          addToCartButtonRef={addToCartBtnRef}
                        />
                      }
                    />
                  }
                  scrollCueLabel={t('personalize.scrollToPurchase')}
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
        <SignatureVoiceDialog
          open={isVoiceDialogOpen}
          existingAssetId={voiceAssetId}
          existingSignedUrl={resolvedVoicePlaybackUrl}
          existingDurationSeconds={resolvedVoiceDurationSeconds}
          pendingRecording={pendingVoiceRecording}
          validationError={voiceValidationError}
          isSaving={isSavingVoice}
          labels={{
            title: t('personalize.signatureVoiceDialogTitle'),
            description: t('personalize.signatureVoiceDialogBody'),
            authorization: t('personalize.signatureVoiceAuthorization'),
            required: t('personalize.requiredLabel'),
            save: t('personalize.saveVoice'),
            saving: t('personalize.savingVoice'),
            remove: t('personalize.removeVoice'),
            close: t('common.close'),
          }}
          onClose={() => {
            if (!isSavingVoice) setIsVoiceDialogOpen(false)
          }}
          onRecordingSelected={handleVoiceRecordingSelected}
          onClearValidation={() => setVoiceValidationError(null)}
          onSave={(recording) => void handleSaveVoice(recording)}
          onRemove={() => void handleRemoveVoice()}
        />

      </main>
    </div>
  );
};
