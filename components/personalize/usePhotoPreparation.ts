'use client'

import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createBrowserPhotoWorker } from '@/lib/photo-preparation/browser-worker'
import { createPhotoPreparation, IDLE_PHOTO } from '@/lib/photo-preparation/controller'

export function usePhotoPreparation(scope: string) {
  const [controller] = useState(() => createPhotoPreparation(createBrowserPhotoWorker()))
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, () => IDLE_PHOTO)
  useLayoutEffect(() => {
    controller.clear()
  }, [controller, scope])
  useLayoutEffect(() => () => controller.dispose(), [controller])
  return { controller, state: state.status !== 'idle' && state.intent.scope === scope ? state : IDLE_PHOTO }
}
