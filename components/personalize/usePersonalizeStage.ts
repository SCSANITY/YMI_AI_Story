'use client'

import { useCallback, useState } from 'react'

export type PersonalizeStage = 'INIT' | 'FORM' | 'GENERATING' | 'PREVIEW'
export type ExitIntent = 'NONE' | 'CHECKOUT' | 'EXIT'
export type ExitPhase = 'IDLE' | 'REQUESTED' | 'EXECUTING'

type RestorePayload = {
  hasDraft: boolean
  savedStage?: 'FORM' | 'PREVIEW'
}

export function getPersistedPersonalizeStep(stage: PersonalizeStage): 2 | 3 {
  return stage === 'PREVIEW' ? 3 : 2
}

export function usePersonalizeStage() {
  const [stage, setStage] = useState<PersonalizeStage>('INIT')
  const [exitIntent, setExitIntent] = useState<ExitIntent>('NONE')
  const [exitPhase, setExitPhase] = useState<ExitPhase>('IDLE')
  const isExiting = exitPhase !== 'IDLE'

  const startForm = useCallback(() => setStage('FORM'), [])

  const generatePreview = useCallback(() => {
    if (stage !== 'FORM') return
    setStage('GENERATING')
  }, [stage])

  const finishGenerating = useCallback(() => setStage('PREVIEW'), [])

  const restore = useCallback((payload: RestorePayload) => {
    setStage((current) => {
      if (current === 'GENERATING') return current
      if (!payload.hasDraft) return 'FORM'
      return payload.savedStage === 'PREVIEW' ? 'PREVIEW' : 'FORM'
    })
  }, [])

  const reset = useCallback(() => {
    setStage('FORM')
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])

  const consumeExitIntent = useCallback(() => {
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])

  const completeExit = useCallback(() => {
    setExitIntent('NONE')
    setExitPhase('IDLE')
  }, [])

  const failExit = useCallback(() => setExitPhase('IDLE'), [])

  const requestCheckout = useCallback(() => {
    if (stage !== 'PREVIEW' || exitPhase !== 'IDLE') return
    setExitIntent('CHECKOUT')
    setExitPhase('REQUESTED')
  }, [exitPhase, stage])

  const requestExit = useCallback(() => {
    if (stage === 'GENERATING' || exitPhase !== 'IDLE') return
    setExitIntent('EXIT')
    setExitPhase('REQUESTED')
  }, [exitPhase, stage])

  const beginExitExecution = useCallback(() => {
    if (exitPhase !== 'REQUESTED') return
    setExitPhase('EXECUTING')
  }, [exitPhase])

  const canGenerate = stage === 'FORM'
  const canAddToCart = stage === 'PREVIEW'
  const canCheckout = stage === 'PREVIEW'
  const canExit = stage !== 'GENERATING'
  const canBack = stage === 'FORM' || stage === 'PREVIEW'
  const backIntent = stage === 'FORM'
    ? 'EXIT_FLOW'
    : stage === 'PREVIEW'
    ? 'CONFIRM_EXIT'
    : 'BLOCKED'
  const uiProgress: 'STORY' | 'CUSTOMIZE' | 'PREVIEW' = stage === 'PREVIEW'
    ? 'PREVIEW'
    : 'CUSTOMIZE'
  const viewState = {
    showForm: stage === 'FORM',
    showPreview: stage === 'PREVIEW',
    showLoading: stage === 'GENERATING',
    showBackButton: stage !== 'GENERATING',
    showExitConfirmOnBack: stage === 'PREVIEW',
    primaryAction: stage === 'FORM' ? 'GENERATE_PREVIEW' : 'NONE',
  } as const

  const primaryAction = useCallback(() => {
    if (isExiting || stage !== 'FORM') return
    generatePreview()
  }, [generatePreview, isExiting, stage])

  return {
    stage,
    exitIntent,
    exitPhase,
    startForm,
    generatePreview,
    finishGenerating,
    reset,
    restore,
    requestCheckout,
    consumeExitIntent,
    beginExitExecution,
    completeExit,
    failExit,
    isExiting,
    canGenerate,
    canAddToCart,
    canCheckout,
    canExit,
    canBack,
    backIntent,
    viewState,
    uiProgress,
    primaryAction,
    requestExit,
  }
}
