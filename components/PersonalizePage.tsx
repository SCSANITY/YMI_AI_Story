'use client'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { BOOKS } from '@/data/books';
import { Button } from '@/components/Button';
import { ChevronLeft, ChevronRight, Camera, Lock, Sparkles, Heart, Shield, Wand2, ShoppingCart, Globe, User as UserIcon, LogOut, Package, HeadphonesIcon, BookOpen, Star, Info, Play, Check, Book, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersonalizeFlow } from '@/components/personalize/usePersonalizeFlow';
import { usePersonalizeState } from '@/components/personalize/usePersonalizeState';
import { uploadUserAsset } from '@/services/assets';
import { createPreviewJob, getJob, getPreviewPages, getPreviewUrl } from '@/services/jobs';
import { supabase } from '@/lib/supabase';
import { usePersonalizeStage } from '@/components/personalize/usePersonalizeStage';
import { isUuid } from '@/lib/validators';





export default function PersonalizePage({ bookID }: { bookID: string }) {

  const fsm = usePersonalizeStage()


  const { user, openLoginModal, logout, addToCart, prepareCheckout, resumeData, resumePersonalization, language, setLanguage, cart} = useGlobalContext();
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const book = BOOKS.find(b => b.bookID === bookID);
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewMode = searchParams?.get('view') || 'edit';
  const creationIdParam = searchParams?.get('creationId') || null;
  const previewJobIdParam = searchParams?.get('jobId') || null;
  const { step: flowStep } = usePersonalizeFlow(book);

  const handleExitFlow = () => {
  setShowExitConfirm(true);
    };



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
    startForm,
    generatePreview,
    finishGenerating,
    reset,
    backIntent,
    restore,
    canAddToCart,
    canCheckout,
    canBack,
    exitIntent, 
    isExiting,
    viewState,
    uiProgress,
    } = fsm;

  //推翻Steps
  const PROGRESS_MAP = {
    STORY: 0,
    CUSTOMIZE: 1,
    PREVIEW: 2,
  } as const

  const currentProgressIndex = PROGRESS_MAP[uiProgress]


  // --- Header Menu States ---
  const [isLangMenuOpen, setLangMenuOpen] = useState(false);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  
 

  // --- Animation States ---
  const [showFlyAnimation, setShowFlyAnimation] = useState(false);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null); 
  const [flyOrigin, setFlyOrigin] = useState({ x: 0, y: 0 });
  const [flyTarget, setFlyTarget] = useState({ x: 0, y: 0 });
  const shouldAnimateToCartRef = useRef(false);
  const exitRunningRef = useRef(false);
  const [showCartToast, setShowCartToast] = useState(false);
  const toastTimerRef = useRef<number | null>(null);



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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioName, setAudioName] = useState<string>('');
  const [voiceAssetId, setVoiceAssetId] = useState<string | null>(null);
  const [voiceStoragePath, setVoiceStoragePath] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [creationId, setCreationId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);
  const checkoutInFlightRef = useRef(false);
  const [templateCoverUrl, setTemplateCoverUrl] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [templateDescription, setTemplateDescription] = useState<string | null>(null);
  const [recentFaces, setRecentFaces] = useState<Array<{ asset_id: string; storage_path?: string | null; signed_url?: string }>>([]);
  type RecentProfileItem = {
    asset_id: string
    metadata?: { child_name?: string; child_age?: number; name?: string; age?: number; gender?: string }
  }
  const [recentProfiles, setRecentProfiles] = useState<RecentProfileItem[]>([]);
  const [showNameHistory, setShowNameHistory] = useState(false);
  const [showAgeHistory, setShowAgeHistory] = useState(false);
  const nameBoxRef = useRef<HTMLDivElement | null>(null);
  const ageBoxRef = useRef<HTMLDivElement | null>(null);
  const hasCartItemForPreview = useMemo(() => {
    if (!bookID || !creationId) return false;
    return cart.some(item => item.bookID === bookID && item.creationId === creationId);
  }, [cart, bookID, creationId]);

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
  const isMobile = windowWidth < 768;

  // Determine Visual State for Animations
  const isClosing = isFlipping && flipDirection === 'prev' && currentSpread === 1;
  const isVisualBookOpen = currentSpread > 0 || (isFlipping && flipDirection === 'next' && currentSpread === 0);
  const isBookClosed = !isVisualBookOpen;

  //FSM【只执行一次】保护
  const didInitFSM = useRef(false);

  /*临时debug
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
    setSelectedLang((data.language as any) || 'English')
    setBookType(data.bookType || 'basic')
    setPhotoPreview(data.photoUrl || null)
    setPhotoAssetId(data.assetId || null)
    setPhotoStoragePath(data.storagePath || null)
    setFaceImageUrl(data.faceImageUrl || null)
    setVoiceAssetId(data.voiceAssetId || null)
    setVoiceStoragePath(data.voiceStoragePath || null)
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
        const urls = await getPreviewPages(previewJobId, [0, 1], { size: 'small' })
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
                if (nextLang) setSelectedLang(nextLang as any)
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
        if (nextLang) setSelectedLang(nextLang as any)
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
    setPreviewJobId(null)
    setCreationId(null)
    setPreviewUrl(null)
    setPreviewPages([])
  }, [bookID, resumeData, viewMode, creationIdParam, creationId, previewJobIdParam, previewJobId, stage, setName, setAge, setSelectedLang, setBookType, setPhoto, setPhotoPreview, setPhotoAssetId, setPhotoStoragePath, setFaceImageUrl, setVoiceAssetId, setVoiceStoragePath, setPreviewJobId, setCreationId, setPreviewUrl, setTemplateCoverUrl, setTemplateTitle, setTemplateDescription])

  useEffect(() => {
    if (stage !== 'GENERATING') return;
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;

    let isActive = true;
    let textInterval: number | null = null;
    let progressInterval: number | null = null;
    let progressTarget = 6;
    let lastRampAt = Date.now();
    const startedAt = Date.now();
    const PREVIEW_MAX_WAIT_MS = 10 * 60 * 1000;
    const PREVIEW_POLL_INTERVAL_MS = 2000;

    setPreviewError(null);
    setProgress(0);

    const messages = [
      "Analyzing cuteness levels...",
      "Sprinkling star dust...",
      `Translating to ${selectedLang}...`,
      "Binding the pages with magic...",
      "Polishing the cover...",
      "Almost there..."
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

        setVoiceAssetId(null)
        setVoiceStoragePath(null)

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
        if (!isActive) return
        setPreviewJobId(created.jobId)
        setCreationId(created.creationId)
        if (!isActive) return

        let fetchFailures = 0
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
            await new Promise((resolve) => setTimeout(resolve, PREVIEW_POLL_INTERVAL_MS))
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
              const urls = await getPreviewPages(created.jobId, [0, 1], { size: 'small' })
              if (!isActive) return
              setPreviewPages(urls)
              if (urls[0]) {
                setPreviewUrl(urls[0])
              } else {
                const url = await getPreviewUrl(created.jobId)
                if (!isActive) return
                setPreviewUrl(url)
              }
            } catch {
              if (!isActive) return
              setPreviewError('Preview is ready but images failed to load. Please refresh.')
            }
            setProgress(100)
            finishGenerating()
            return
          }

          if (job.status === 'failed') {
            throw new Error(job.error_message || 'Preview generation failed. Please try again.')
          }

          if (Date.now() - startedAt > PREVIEW_MAX_WAIT_MS) {
            throw new Error('Preview generation timed out. Please try again.')
          }

          await new Promise((resolve) => setTimeout(resolve, PREVIEW_POLL_INTERVAL_MS))
        }
      } catch (error: any) {
        if (!isActive) return
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
  }, [stage, selectedLang, finishGenerating, setProgress, setLoadingText, book, photo, audioFile, user, reset]);

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
      setRecentFaces(faces);
    };

    loadUserAssets();

    return () => {
      isActive = false;
    };
  }, [user?.customerId]);

  useEffect(() => {
    setRecentProfiles([]);
  }, [user?.customerId]);

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
      setShowNameHistory(false);
      setShowAgeHistory(false);
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

    const hasCartItemForBook = cart.some(item => item.bookID === bookID);
    if ((hasCartItemForPreview || hasCartItemForBook) && fsm.backIntent === 'CONFIRM_EXIT') {
      fsm.startForm()
      return
    }

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



  const confirmExit = (intent: 'ADD_TO_CART' | 'EXIT') => {
    setShowExitConfirm(false)

    if (intent === 'ADD_TO_CART') {
        fsm.requestAddToCart()
    } else {
        fsm.requestExit()
    }
  }


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

  const triggerCartToast = useCallback(() => {
    setShowCartToast(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setShowCartToast(false);
      toastTimerRef.current = null;
    }, 1600);
  }, []);


  const performAddToCart = useCallback(async () => {
    if (!fsm.canAddToCart) return
    if (!resolvedBook) return

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
      return
    }

    const item = await addToCart(
        resolvedBook!,
        {
        childName: name,
        childAge: age,
        language: selectedLang as any,
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

    if (item) {
      triggerCartToast();
    }
    shouldAnimateToCartRef.current = false;
    }, [fsm.canAddToCart, resolvedBook, addToCart, name, age, selectedLang, bookType, flowStep, photoPreview, photoAssetId, photoStoragePath, voiceAssetId, voiceStoragePath, previewJobId, creationId, creationIdParam, resolveCreationId, previewPages, previewUrl, triggerCartToast]);


  const performCheckout = useCallback(async () => {
        if (!fsm.canCheckout) return
        if (checkoutInFlightRef.current) return
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
              language: selectedLang as any,
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
    }, [fsm.canCheckout, resolvedBook, name, age, selectedLang, bookType, photoPreview, photoAssetId, photoStoragePath, voiceAssetId, voiceStoragePath, previewJobId, creationId, creationIdParam, resolveCreationId, flowStep, prepareCheckout, router, cart, user?.customerId]);

  const handleAddToCartClick = () => {
    if (!fsm.canAddToCart || isExiting) return;
    shouldAnimateToCartRef.current = true;
    triggerFlyToCart();
    fsm.requestAddToCart();
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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
            router.back()
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
    }, [fsm.exitPhase, fsm.exitIntent, fsm.completeExit, fsm.failExit, performAddToCart, performCheckout, router])




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
 *刷新页面后，仍然停留在 FORM / PREVIEW
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
      if (direction === 'next' && currentSpread >= TOTAL_SPREADS) return;
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
                         <span>Change Photo</span>
                         <input type="file" onChange={handlePhotoUpload} className="hidden" accept="image/*" />
                     </label>
                  </div>

                  <div className="absolute bottom-12 left-0 right-0 text-center bg-white/80 backdrop-blur-sm py-4 text-gray-900 z-20 shadow-lg mx-8 rounded-lg border border-white/50">
                      <h3 className="font-serif text-2xl italic text-amber-900">{name || "Your"}'s Adventure</h3>
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
      // 2 & 3. First inside spread (full 01.png across both pages)
      if (spreadIndex === 1 && (side === 'left' || side === 'right')) {
          const spreadImage = previewPages[1] || '';
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
                  <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                    <Camera className="h-10 w-10" />
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
                <h3 className="font-serif text-xl font-bold text-gray-800 mb-4">Page {pageNum}</h3>
                <div className="mt-4 h-32 bg-gray-200/50 rounded-md"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-gray-100 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-bold text-gray-600">Locked</span>
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
  if (!book) return <div>Book not found</div>;

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
  
  // Helper Functions for Render
  const getLangLabel = (lang: string) => {
      switch(lang) {
          case 'cn_s': return 'CN (简)';
          case 'cn_t': return 'CN (繁)';
          default: return 'EN';
      }
  };

  const renderProgressSteps = () => {
    // Premium Progress Bar
    const steps = [
        { num: 1, label: "Story", icon: Book },
        { num: 2, label: "Customize", icon: Sparkles },
        { num: 3, label: "Preview", icon: Wand2 },
    ];

    return (
      <div className="max-w-2xl mx-auto mb-10 relative hidden md:block px-4">
          {/* Track Background - Adjusted left-9 right-9 to be fully covered by circles */}
          <div className="absolute top-1/2 left-9 right-9 h-1.5 bg-gray-100 -translate-y-1/2 rounded-full z-0 overflow-hidden shadow-inner">
             {/* Active Track Fill */}
             <motion.div 
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                initial={false}
                animate={{ width: currentProgressIndex === 2
                                    ? '100%'
                                    : currentProgressIndex === 1
                                    ? '50%'
                                    : '0%', 
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
             />
          </div>

          <div className="relative flex justify-between z-10 w-full">
               {steps.map((s, idx) => {
                   // Logic: Step is considered "active" or "completed" based on current step
                        const stepIndex = s.num - 1
                        const isCompleted = currentProgressIndex > stepIndex
                        const isActive = currentProgressIndex === stepIndex
                        const isUpcoming = currentProgressIndex < stepIndex;


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
              'Vibrant Digital Copy: High-definition PDF optimized for tablet viewing.',
              'Toolkit: 5 curated prompts to spark deep parent-child dialogue.',
              'Anywhere Access: Instant, eco-friendly delivery for mobile storytelling.',
          ],
          basic: [
              'All Digital Features Included.',
              'Premium Heirloom Binding: Durable, archival-quality hardcover with matte-finish pages.',
              'Tactile Literacy: Develops fine motor skills and focus through physical page-turning.',
              'Smudge-Proof Art: High-pigment printing designed to resist little fingerprints.',
          ],
          premium: [
              'All Hardcover Features Included.',
              'Cinematic Narrator: Pre-loaded professional voiceover with character acting.',
              'Rich Soundscapes: Layered background scores (nature sounds and magical chimes).',
              'Self-Guided Reading: Enables children to explore the story independently through sound cues.',
          ],
          supreme: [
              'All Immersive Features Included.',
              'Parent-Voice Integration: The book is custom-programmed with your actual voice.',
              'Bespoke Dedication: A personalized "Letter to My Child" printed on the opening page.',
              'Emotional Anchor: Provides a permanent sense of security by preserving your voice for a lifetime.',
          ],
      } as const

      const items = includedItems[bookType] ?? includedItems.digital

      return (
          <div className="mt-4 p-4 bg-amber-50/50 rounded-xl border border-amber-100">
              <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  What is Included
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

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-amber-100 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-amber-600 transition-colors">
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm font-medium">Back</span>
            </button>
            <div className="text-gray-900 font-serif font-bold text-lg hidden sm:block">
                {book.title}
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
                <div className="relative">
                    <Button variant="ghost" size="sm" onClick={() => setLangMenuOpen(!isLangMenuOpen)} className="gap-1 px-2">
                        <Globe className="h-4 w-4" />
                        <span className="uppercase text-xs font-semibold">{getLangLabel(language)}</span>
                    </Button>
                    {isLangMenuOpen && (
                        <div className="absolute right-0 mt-2 w-40 rounded-md border border-gray-100 bg-white shadow-lg py-1 z-50">
                             <button onClick={() => { setLanguage('en'); setLangMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">English</button>
                             <button onClick={() => { setLanguage('cn_s'); setLangMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">简体中文</button>
                             <button onClick={() => { setLanguage('cn_t'); setLangMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">繁體中文</button>
                        </div>
                    )}
                </div>

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
                                <button onClick={() => { router.push('/orders'); setUserMenuOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><Package className="h-4 w-4" />My Orders</button>
                                <button onClick={() => { logout(); setUserMenuOpen(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
                            </div>
                        )}
                    </div>
                    ) : (
                        <Button onClick={() => openLoginModal()} size="sm">Log In</Button>
                    )}
                </div>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-8 relative">
        
        {renderProgressSteps()}

        <AnimatePresence mode="wait">
            
            {/* Step 1 (Skipped logic) */}


            {/* Step 2: The Rich Form */}
            {viewState.showForm && (
                <motion.div 
                    key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-8"
                >
                     <div className="lg:col-span-5 space-y-6">
                        <div className="bg-white/60 backdrop-blur-md border border-white p-6 rounded-2xl shadow-lg">
                            <img src={templateCoverUrl || book.coverUrl} className="w-full aspect-[3/4] object-cover rounded-lg shadow-xl mb-6 border-4 border-white" />
                            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">{templateTitle || book.title}</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-6">{templateDescription || book.description}</p>
                            
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">Magic Attributes</h4>
                                <div className="flex items-center justify-between text-sm text-gray-700">
                                    <span className="flex items-center gap-2"><Heart className="h-4 w-4 text-pink-400" /> Kindness</span>
                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full"><div className="w-[90%] h-full bg-pink-400 rounded-full"></div></div>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-700">
                                    <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-blue-400" /> Courage</span>
                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full"><div className="w-[80%] h-full bg-blue-400 rounded-full"></div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-7">
                        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-amber-50 h-full flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2">
                                    <Sparkles className="h-6 w-6 text-amber-500" /> Customize
                                </h3>
                                <div className="text-2xl font-bold text-amber-600">${currentPrice}</div>
                            </div>

                            <div className="space-y-6 flex-grow">
                                <div className="border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center bg-amber-50/60 hover:bg-amber-50 transition-colors relative group cursor-pointer">
                                    <input type="file" onChange={handlePhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer z-30" accept="image/*" />
                                    {photoPreview ? (
                                        <div className="relative z-10 pointer-events-none">
                                            <img src={photoPreview} className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-white shadow-lg" />
                                            <p className="text-xs text-amber-600 mt-2 font-medium">Click to change photo</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 pointer-events-none">
                                            <motion.div
                                                className="relative w-18 h-18 mx-auto"
                                                animate={{ y: [0, -4, 0] }}
                                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                            >
                                                <span className="absolute inset-0 rounded-full bg-amber-300/40 blur-xl animate-pulse-slow" />
                                                <span className="absolute inset-2 rounded-full bg-amber-200/40 blur-lg animate-pulse" />
                                                <div className="relative w-18 h-18 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform shadow-[0_8px_20px_rgba(234,179,8,0.25)] ring-4 ring-amber-100">
                                                    <Camera className="h-9 w-9" />
                                                </div>
                                            </motion.div>
                                            <h4 className="font-bold text-gray-900">Upload Child's Photo</h4>
                                            <div className="rounded-2xl border border-amber-100 bg-white/70 p-3 shadow-sm">
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[0, 1, 2].map((item) => (
                                                        <div key={`good-${item}`} className="relative mx-auto">
                                                            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                                                                <UserIcon className="h-6 w-6" />
                                                            </div>
                                                            <div className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                                                <Check className="h-3 w-3" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-2 grid grid-cols-3 gap-2">
                                                    {[0, 1, 2].map((item) => (
                                                        <div key={`bad-${item}`} className="relative mx-auto">
                                                            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
                                                                <UserIcon className="h-6 w-6" />
                                                            </div>
                                                            <div className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-rose-500 text-white flex items-center justify-center">
                                                                <span className="text-xs font-bold leading-none">×</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-3 text-xs text-gray-500 text-left">
                                                    Tips: good lighting, no hats or sunglasses, eyes visible.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {recentFaces.length > 0 && (
                                  <div className="flex flex-wrap gap-3">
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

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div ref={nameBoxRef} className="space-y-2 relative">
                                        <label className="text-sm font-bold text-gray-700">Name</label>
                                        <input 
                                            type="text" 
                                            value={name} 
                                            onChange={(e) => setName(e.target.value)} 
                                            onFocus={() => {
                                              loadProfiles();
                                              setShowNameHistory(true);
                                              setShowAgeHistory(false);
                                            }}
                                            placeholder="e.g. Oliver" 
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
                                              <div className="px-3 py-2 text-xs text-gray-400">No history</div>
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
                                        <label className="text-sm font-bold text-gray-700">Age</label>
                                        <input 
                                            type="number" 
                                            value={age} 
                                            onChange={(e) => setAge(e.target.value)} 
                                            onFocus={() => {
                                              loadProfiles();
                                              setShowAgeHistory(true);
                                              setShowNameHistory(false);
                                            }}
                                            placeholder="e.g. 5" 
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
                                              <div className="px-3 py-2 text-xs text-gray-400">No history</div>
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

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">Story Language</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {['English', 'Chinese'].map((lang) => (
                                            <button 
                                                key={lang}
                                                onClick={() => setSelectedLang(lang)}
                                                className={`py-3 px-4 rounded-xl border-2 font-medium transition-all ${selectedLang === lang ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300'}`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-gray-700">Book Type</label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <button onClick={() => setBookType('digital')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'digital' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">Cloud Explorer</div>
                                            <div className="text-xs text-gray-500">PDF only</div>
                                        </button>
                                        <button onClick={() => setBookType('basic')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'basic' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">Classic</div>
                                            <div className="text-xs text-gray-500">Hardcover Edition</div>
                                        </button>
                                        <button onClick={() => setBookType('premium')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'premium' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-blue-900">Immersive</div>
                                            <div className="text-xs text-blue-600">Enchanted Audio</div>
                                        </button>
                                        <button onClick={() => setBookType('supreme')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'supreme' ? 'border-gray-900 bg-gray-100' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">Legacy Signature</div>
                                            <div className="text-xs text-gray-500">Your Voice Version</div>
                                        </button>
                                    </div>
                                    {renderProductShowcase()}
                                </div>
                                {bookType === 'premium' && (
                                    <div className="border-2 border-dashed border-blue-200 rounded-2xl p-5 bg-blue-50/50">
                                        <label className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-3">
                                            <HeadphonesIcon className="h-4 w-4" /> Upload Voice Recording
                                        </label>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={(e) => {
                                                const file = e.target.files && e.target.files[0];
                                                setAudioFile(file ?? null);
                                                setAudioName(file ? file.name : '');
                                                setVoiceAssetId(null);
                                                setVoiceStoragePath(null);
                                            }}
                                            className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-500"
                                        />
                                        <p className="text-xs text-gray-500 mt-2">
                                            {audioName ? `Selected: ${audioName}` : 'Optional for premium preview. Real upload will connect later.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-8 mt-4 border-t border-gray-100">
                                <button 
                                    onClick={fsm.primaryAction} 
                                    disabled={!isFormValid || isSupreme} 
                                    className={`w-full h-16 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all duration-500 shadow-xl ${(!isFormValid || isSupreme) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:scale-[1.02] shadow-amber-200'}`}
                                >
                                    {isSupreme ? "Coming Soon" : <><Sparkles className="h-6 w-6" /> {isFormValid ? "Generate Magic Preview" : "Complete Details to Continue"}</>}
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
                        <h2 className="text-2xl md:text-3xl font-serif font-bold mb-2">Preview {name}'s Story</h2>
                        <p className="text-gray-600 text-sm md:text-base">Flip through the first few pages of your masterpiece.</p>
                    </div>

                    <div 
                        className="relative mb-8 md:mb-12 select-none flex justify-center perspective-2000" 
                        style={{ height: isMobile ? Math.round(PREVIEW_HEIGHT * 0.55) : PREVIEW_HEIGHT }}
                    >
                         {/* Responsive Scaler Wrapper */}
                         <div style={{ transform: `scale(${isMobile ? 0.45 : 1})`, transformOrigin: 'top center', width: PAGE_WIDTH * 2 }}>
                            <motion.div 
                                className="relative w-full flex justify-center" 
                                animate={{ x: (currentSpread === 0 && !isFlipping) ? -190 : 0 }} 
                                transition={{ duration: ANIMATION_DURATION, ease: "easeInOut" }} 
                                style={{ transformStyle: 'preserve-3d', perspective: '2500px', height: PREVIEW_HEIGHT }}
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
                                    <div className={`relative h-full shadow-2xl ${isLeftPageVisible ? 'opacity-100' : 'opacity-0'}`} style={{ width: PAGE_WIDTH }}>
                                        {renderPageContent('left', staticLeftIndex)}
                                    </div>
                                    <div className="relative h-full shadow-2xl" style={{ width: PAGE_WIDTH }}>
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

                    <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6 w-full max-w-md sm:max-w-none">
                         <Button ref={addToCartBtnRef} onClick={handleAddToCartClick} size="lg" variant="outline" className="h-12 md:h-14 w-full sm:w-auto px-8 text-base md:text-lg font-bold rounded-full border-2 border-amber-500 text-amber-600 bg-white hover:bg-amber-50 relative z-20">
                            <ShoppingCart className="h-5 w-5 mr-2" />
                            Add to Cart - ${currentPrice}
                        </Button>
                        <Button onClick={fsm.requestCheckout} size="lg" className="h-12 md:h-14 w-full sm:w-auto px-12 text-base md:text-lg font-bold rounded-full shadow-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white border border-white/20 transform transition-all hover:scale-105">
                            Checkout Now
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

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
                            <p className="text-gray-500 text-sm font-mono">Estimated wait time: ~4seconds</p>
                        </div>
                        
                        {/* Progress Bar Container */}
                        <div className="w-full max-w-lg mx-auto">
                             <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative shadow-inner mb-6">
                                <motion.div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" style={{ width: `${progress}%` }} />
                                <motion.div 
                                    className="absolute top-0 bottom-0 w-20 bg-white/30 skew-x-[-20deg]" 
                                    animate={{ x: ['-100%', '500%'] }} 
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} 
                                />
                            </div>

                            {/* New Video/Media Window for Loading Content */}
                            <div className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-2xl border-4 border-white/50 group">
                                <img 
                                    src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop" 
                                    className="w-full h-full object-cover opacity-80"
                                    alt="Magic Process" 
                                />
                                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-4">
                                     <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-3 animate-pulse">
                                         <Play className="h-5 w-5 fill-white text-white ml-1" />
                                     </div>
                                     <p className="font-bold text-lg tracking-wide">Printing Magic...</p>
                                     <p className="text-xs opacity-70">Creating your personalized storybook</p>
                                </div>
                            </div>

                             {/* Tip text below video */}
                             <motion.p 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                                className="text-amber-900 text-sm font-medium flex items-center justify-center gap-2 mt-4"
                             >
                                 <Info className="h-4 w-4 text-amber-500" /> 
                                 <span>Did you know? Each book is hand-bound by our expert wizards.</span>
                             </motion.p>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 text-center">
                  <ShoppingCart className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Wait! Don't lose your magic.</h3>
                  <p className="text-gray-600 mb-6">You have customized a beautiful book. Would you like to add it to your cart before leaving?</p>
                  <div className="flex gap-3 justify-center">
                      <Button variant="outline" onClick={() => confirmExit('EXIT')}>No, Just Leave</Button>
                      <Button variant="primary" onClick={() => confirmExit('ADD_TO_CART')}>Yes, Add to Cart</Button>
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
};
