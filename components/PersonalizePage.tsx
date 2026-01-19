'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { BOOKS } from '@/data/books';
import { Button } from '@/components/Button';
import { ChevronLeft, ChevronRight, Camera, Lock, Sparkles, Heart, Shield, Wand2, ShoppingCart, Globe, User as UserIcon, LogOut, Package, HeadphonesIcon, BookOpen, Star, Info, Play, Check, Book } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePersonalizeFlow } from '@/components/personalize/usePersonalizeFlow';
import { usePersonalizeState } from '@/components/personalize/usePersonalizeState';
import { usePersonalizeStage } from '@/components/personalize/usePersonalizeStage';





export default function PersonalizePage({ bookID }: { bookID: string }) {

  const fsm = usePersonalizeStage()


  const { user, openLoginModal, logout, addToCart, prepareCheckout, resumeData, resumePersonalization, language, setLanguage, cart} = useGlobalContext();
  const book = BOOKS.find(b => b.bookID === bookID);
  console.log('[Personalize] bookID from route:', bookID);
  console.log('[Personalize] available BOOKS ids:', BOOKS.map(b => b.bookID));
  const router = useRouter();
    const {
    draft,
    step: flowStep,
    personalization,
    setStep: flowSetStep,
    updatePersonalization,
    commitToCart,
    } = usePersonalizeFlow(book);

  const handleExitFlow = () => {
  setShowExitConfirm(true);
    };



  const {
    name, setName,
    age, setAge,
    selectedLang, setSelectedLang,
    photo, setPhoto,
    photoPreview, setPhotoPreview,
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
  const PAGE_HEIGHT = 500; // Fixed height for ratio calculations
  const ANIMATION_DURATION = 0.8; 
  
  const [currentSpread, setCurrentSpread] = useState(0); 
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioName, setAudioName] = useState<string>('');

  // --- Mobile Responsive State ---
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

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
        savedStage: 'FORM',
        })
    } else {
        fsm.startForm()
    }

    didInitFSM.current = true
  }, [bookID, resumeData, fsm])



  useEffect(() => {
    if (!resumeData) return
    if (resumeData.bookID !== bookID) return

    fsm.restore({
        hasDraft: !!resumeData.personalization,
        savedStage: 'FORM',
    })

    didInitFSM.current = true
  }, [resumeData, bookID])

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
    resumePersonalization(null)
  }, [resumeData, bookID, setName, setAge, setSelectedLang, setBookType, setPhotoPreview, resumePersonalization])

  useEffect(() => {
    if (resumeData && resumeData.bookID === bookID) return

    setName('')
    setAge('')
    setSelectedLang('English')
    setBookType('basic')
    setPhoto(null)
    setPhotoPreview(null)
  }, [bookID, resumeData, setName, setAge, setSelectedLang, setBookType, setPhoto, setPhotoPreview])

  // Loading Sequence - Optimized to 4 seconds
  useEffect(() => {
  if (stage !== 'GENERATING') return;

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

  const textInterval = setInterval(() => {
    i = (i + 1) % messages.length;
    setLoadingText(messages[i]);
  }, 800);

  const totalSteps = 4000 / 50;
  const increment = 100 / totalSteps;

  const progressInterval = setInterval(() => {
    setProgress(prev => (prev >= 100 ? 100 : prev + increment));
  }, 50);

  const timeout = setTimeout(() => {
    finishGenerating();
  }, 4000);

  return () => {
    clearInterval(textInterval);
    clearInterval(progressInterval);
    clearTimeout(timeout);
  };
    }, [stage, selectedLang, finishGenerating, setProgress, setLoadingText]);




  // --- Handlers ---

  const handleBack = () => {
    if (!fsm.canBack) return

    switch (fsm.backIntent) {
        case 'EXIT_FLOW':
        fsm.requestExit()
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


  const performAddToCart = useCallback(() => {
    if (!fsm.canAddToCart) return
    if (!book) return

    if (!user) {
        openLoginModal()
        return
    }

    addToCart(
        book!,
        {
        childName: name,
        childAge: age,
        language: selectedLang as any,
        dedication: '',
        bookType,
        photoUrl: photoPreview ?? undefined,
        },
        flowStep
    )

    triggerCartToast();
    shouldAnimateToCartRef.current = false;
    }, [fsm.canAddToCart, book, user, openLoginModal, addToCart, name, age, selectedLang, bookType, flowStep, photoPreview, triggerCartToast]);


   const performCheckout = useCallback(() => {
        if (!fsm.canCheckout) return

        if (!user) {
            openLoginModal()
            return
        }
        if (book) {
            const checkoutItem = {
                id: Math.random().toString(36).substr(2, 9),
                bookID: book.bookID,
                quantity: 1,
                book: book,
                priceAtPurchase: currentPrice,
                personalization: { childName: name, childAge: age, language: selectedLang as any, dedication: '', bookType, photoUrl: photoPreview ?? undefined }
            };
            prepareCheckout([checkoutItem]);

            router.push('/checkout');
        }
    }, [fsm.canCheckout, user, openLoginModal, book, name, age, selectedLang, bookType, currentPrice, photoPreview, prepareCheckout, router]);

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
                  
                  <img src={book?.coverUrl} className="w-full h-full object-cover mix-blend-multiply opacity-95" />
                  
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
      // 2. Inside Left
      if (spreadIndex === 1 && side === 'left') {
          return (
            <div className="w-full h-full relative border-r border-gray-200 overflow-hidden rounded-l-sm" style={commonPageStyle}>
                <div className="absolute inset-0 pointer-events-none z-10" style={{ background: bindingShadow }} />
                <div className="p-10 h-full flex flex-col justify-center text-center">
                    <p className="font-serif text-gray-500 italic mb-4 text-sm">Dedication</p>
                    <p className="font-serif text-xl text-gray-800 leading-relaxed italic">"For the bravest adventurer I know."</p>
                    <div className="mt-8 border-t border-gray-300 w-12 mx-auto" />
                    <p className="mt-4 text-xs text-gray-500 font-serif">For {name}</p>
                </div>
                {!isFlipping && (
                    <div className="absolute top-1/2 left-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors"
                         onClick={(e) => { e.stopPropagation(); turnPage('prev'); }}>
                        <ChevronLeft className="h-8 w-8 text-gray-500" />
                    </div>
                )}
            </div>
          );
      }
      // 3. Inside Right
      if (spreadIndex === 1 && side === 'right') {
          return (
            <div className="w-full h-full relative overflow-hidden rounded-r-sm" style={commonPageStyle}>
                  <div className="absolute inset-0 pointer-events-none z-10" style={{ background: bindingShadow }} />
                  <div className="p-8 h-full flex flex-col relative z-0">
                      <span className="absolute top-4 right-4 text-gray-400 font-serif text-xs">1</span>
                      <h3 className="font-serif text-2xl font-bold text-gray-900 mb-4">Chapter One</h3>
                      <p className="text-sm text-gray-800 leading-loose mb-4">
                          The morning sun peeked through the window, waking <span className="font-bold text-blue-600">{name || "the hero"}</span> up. 
                      </p>
                      <div className="flex-1 bg-white p-2 rounded-lg shadow-sm border border-gray-200 rotate-2">
                          {photoPreview ? (
                              <img src={photoPreview} className="w-full h-full object-cover" />
                          ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                                  <Camera className="h-10 w-10" />
                              </div>
                          )}
                      </div>
                  </div>
                  {!isFlipping && (
                    <div className="absolute top-1/2 right-4 transform -translate-y-1/2 z-30 cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors"
                        onClick={(e) => { e.stopPropagation(); turnPage('next'); }}>
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

  const isFormValid = name.length > 0 && age.length > 0 && (photo !== null || !!photoPreview);
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
      return (
          <div className="mt-4 p-4 bg-amber-50/50 rounded-xl border border-amber-100">
              <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  What is Included
              </h5>
              <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                      <div className="min-w-[16px]"><Check className="h-4 w-4 text-green-500" /></div>
                      <span>{
                        bookType === 'digital'
                          ? 'Instant PDF + mobile story access'
                          : bookType === 'basic'
                          ? 'High-quality matte paper'
                          : bookType === 'premium'
                          ? 'Premium glossy paper'
                          : 'Tear-proof synthetic paper'
                      }</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                      <div className="min-w-[16px]"><Check className="h-4 w-4 text-green-500" /></div>
                      <span>{
                        bookType === 'digital'
                          ? 'Digital-first layout'
                          : bookType === 'basic'
                          ? 'Durable Softcover'
                          : 'Heirloom Hardcover Binding'
                      }</span>
                  </li>
                   <li className="flex items-center gap-2 text-sm text-gray-700">
                      <div className="min-w-[16px]"><Check className="h-4 w-4 text-green-500" /></div>
                      <span>{
                        bookType === 'digital'
                          ? 'Shareable digital keepsake'
                          : bookType === 'basic'
                          ? 'Standard Color Printing'
                          : 'Vibrant 6-Color HD Printing'
                      }</span>
                  </li>
                  {bookType === 'premium' && (
                      <li className="flex items-center gap-2 text-sm text-gray-700 font-bold">
                          <div className="min-w-[16px]"><Sparkles className="h-4 w-4 text-purple-500" /></div>
                          <span>Recordable Voice Add-on</span>
                      </li>
                  )}
                  {bookType === 'supreme' && (
                      <li className="flex items-center gap-2 text-sm text-gray-700 font-bold">
                          <div className="min-w-[16px]"><HeadphonesIcon className="h-4 w-4 text-purple-500" /></div>
                          <span>Interactive Audio Module</span>
                      </li>
                  )}
              </ul>
          </div>
      );
  };

  return (
    <div className="min-h-screen flex flex-col font-sans relative z-20">
      
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
        {showCartToast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg"
          >
            Added to cart
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
                    {cart.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                            {cart.length}
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
                        <Button onClick={openLoginModal} size="sm">Log In</Button>
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
                            <img src={book.coverUrl} className="w-full aspect-[3/4] object-cover rounded-lg shadow-xl mb-6 border-4 border-white" />
                            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">{book.title}</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-6">{book.description}</p>
                            
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
                                <div className="border-2 border-dashed border-purple-200 rounded-2xl p-6 text-center bg-purple-50/50 hover:bg-purple-50 transition-colors relative group cursor-pointer">
                                    <input type="file" onChange={handlePhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                                    {photoPreview ? (
                                        <div className="relative z-20">
                                            <img src={photoPreview} className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-white shadow-lg" />
                                            <p className="text-xs text-purple-600 mt-2 font-medium">Click to change photo</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto text-purple-600 group-hover:scale-110 transition-transform">
                                                <Camera className="h-8 w-8" />
                                            </div>
                                            <h4 className="font-bold text-gray-900">Upload Child's Photo</h4>
                                            <p className="text-xs text-gray-500">For best results, use a clear front-facing photo</p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700">Hero's Name</label>
                                        <input 
                                            type="text" 
                                            value={name} 
                                            onChange={(e) => setName(e.target.value)} 
                                            placeholder="e.g. Oliver" 
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700">Hero's Age</label>
                                        <input 
                                            type="number" 
                                            value={age} 
                                            onChange={(e) => setAge(e.target.value)} 
                                            placeholder="e.g. 5" 
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium" 
                                        />
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
                                            <div className="text-sm font-bold text-gray-900">Digital</div>
                                            <div className="text-xs text-gray-500">PDF Only</div>
                                        </button>
                                        <button onClick={() => setBookType('basic')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'basic' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">Standard</div>
                                            <div className="text-xs text-gray-500">Softcover</div>
                                        </button>
                                        <button onClick={() => setBookType('premium')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'premium' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-blue-900">Premium</div>
                                            <div className="text-xs text-blue-600">Voice Add-on</div>
                                        </button>
                                        <button onClick={() => setBookType('supreme')} className={`p-3 rounded-lg border-2 text-left transition-all ${bookType === 'supreme' ? 'border-gray-900 bg-gray-100' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                            <div className="text-sm font-bold text-gray-900">Deluxe</div>
                                            <div className="text-xs text-gray-500">Touch Audio</div>
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
                        style={{ height: isMobile ? 260 : 550 }}
                    >
                         {/* Responsive Scaler Wrapper */}
                         <div style={{ transform: `scale(${isMobile ? 0.45 : 1})`, transformOrigin: 'top center', width: PAGE_WIDTH * 2 }}>
                            <motion.div 
                                className="relative w-full flex justify-center h-[520px]" 
                                animate={{ x: (currentSpread === 0 && !isFlipping) ? -190 : 0 }} 
                                transition={{ duration: ANIMATION_DURATION, ease: "easeInOut" }} 
                                style={{ transformStyle: 'preserve-3d', perspective: '2500px' }}
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
                            <p className="text-gray-500 text-sm font-mono">Estimated wait time: ~4 seconds</p>
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
