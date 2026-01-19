/**
 * FSM is the single source of truth for UI state.
 * `step` exists only for persistence and business flow.
 */

'use client'
import { useState, useCallback } from 'react'

export type PersonalizeStage =
  | 'INIT'
  | 'FORM'
  | 'GENERATING'
  | 'PREVIEW'

export type ExitIntent =
  | 'NONE'
  | 'ADD_TO_CART'
  | 'CHECKOUT'
  | 'EXIT'

export type ExitPhase =
  | 'IDLE'
  | 'REQUESTED'
  | 'EXECUTING'


type RestorePayload = {
  hasDraft: boolean
  savedStage?: 'FORM' | 'PREVIEW'
}

export function usePersonalizeStage() {
  const [stage, setStage] = useState<PersonalizeStage>('INIT')
  const [exitIntent, setExitIntent] = useState<ExitIntent>('NONE')

  /* -----------------------------
   * Stage transitions
   * ----------------------------*/

  const startForm = useCallback(() => {
    setStage('FORM')
  }, [])

  const generatePreview = useCallback(() => {
    if (stage !== 'FORM') return
    setStage('GENERATING')
  }, [stage])

  const finishGenerating = useCallback(() => {
    setStage('PREVIEW')
  }, [])




  /* -----------------------------
   * FSM-7-1 核心：restore
   * ----------------------------*/


  const restore = useCallback(
    (payload: RestorePayload) => {
      setStage(prev => {
        // 🔒 GENERATING 是锁定态，不能被恢复逻辑打断
        if (prev === 'GENERATING') return prev

        if (!payload.hasDraft) {
          return 'FORM'
        }

        if (payload.savedStage === 'PREVIEW') {
          return 'PREVIEW'
        }

        return 'FORM'
      })
    },
    []
  )

  /* -----------------------------
   * Exit intents
   * ----------------------------*/

  
  const [exitPhase, setExitPhase] = useState<ExitPhase>('IDLE')
  const isExiting = exitPhase !== 'IDLE'

  const reset = useCallback(() => {
    setStage('FORM')
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])

  const completeExit = useCallback(() => {
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])

  const failExit = useCallback(() => {
    // 未来可用于 toast / retry
    setExitPhase('IDLE')
  }, [])



  const consumeExitIntent = useCallback(() => {
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])


  const requestAddToCart = () => {
    if (stage !== 'PREVIEW') return
    if (exitPhase !== 'IDLE') return

    setExitIntent('ADD_TO_CART')
    setExitPhase('REQUESTED')
  }

  const requestCheckout = () => {
    if (stage !== 'PREVIEW') return
    if (exitPhase !== 'IDLE') return

    setExitIntent('CHECKOUT')
    setExitPhase('REQUESTED')
  }

  const requestExit = useCallback(() => {
    if (stage === 'GENERATING') return
    if (exitPhase !== 'IDLE') return

    setExitIntent('EXIT')
    setExitPhase('REQUESTED')
  }, [stage, exitPhase])

  const beginExitExecution = useCallback(() => {
    if (exitPhase !== 'REQUESTED') return
    setExitPhase('EXECUTING')
  }, [exitPhase])


  /* -----------------------------
   * Permissions / semantics
   * ----------------------------*/

  const canGenerate = stage === 'FORM'
  const canAddToCart = stage === 'PREVIEW'
  const canCheckout = stage === 'PREVIEW'
  const canExit = stage !== 'GENERATING'
  const canBack = stage === 'FORM' || stage === 'PREVIEW'

  const backIntent =
    stage === 'FORM'
      ? 'EXIT_FLOW'
      : stage === 'PREVIEW'
      ? 'CONFIRM_EXIT'
      : 'BLOCKED'

  /* -----------------------------
   * viewmodel
   * ----------------------------*/
  type UIProgress = 'STORY' | 'CUSTOMIZE' | 'PREVIEW'

  const viewState = {
    showForm: stage === 'FORM',
    showPreview: stage === 'PREVIEW',
    showLoading: stage === 'GENERATING',

    showBackButton: stage !== 'GENERATING',
    showExitConfirmOnBack: stage === 'PREVIEW',

    primaryAction:
        stage === 'FORM'
        ? 'GENERATE_PREVIEW'
        : stage === 'PREVIEW'
        ? 'ADD_TO_CART'
        : 'NONE',
    }


  const uiProgress: UIProgress =
        stage === 'FORM'
          ? 'CUSTOMIZE'
          : stage === 'PREVIEW'
          ? 'PREVIEW'
          : 'CUSTOMIZE'

  /* -----------------------------
   * viewmodel？
   * ----------------------------*/

  const primaryAction = useCallback(() => {
    if (isExiting) return

    switch (stage) {
      case 'FORM':
        generatePreview()
        break
      case 'PREVIEW':
        requestAddToCart()
        break
    }
  }, [stage, isExiting, generatePreview, requestAddToCart])




  return {
    // state
    stage,
    exitIntent,
    exitPhase,

    // transitions
    startForm,
    generatePreview,
    finishGenerating,
    reset,

    // restore
    restore,

    // exit intent
    requestAddToCart,
    requestCheckout,
    consumeExitIntent,
    beginExitExecution,
    completeExit,
    failExit,
    isExiting,

    // semantics
    canGenerate,
    canAddToCart,
    canCheckout,
    canExit,
    canBack,
    backIntent,
    

    //view model
    viewState,
    uiProgress,

    // FSM-7-3
    primaryAction,

    // FSM-7-4 Exit
    requestExit
  }
}
