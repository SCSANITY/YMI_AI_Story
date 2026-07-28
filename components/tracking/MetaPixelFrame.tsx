'use client'

import { useEffect } from 'react'
import {
  META_FRAME_CONSENT_MESSAGE,
  META_FRAME_EVENT_MESSAGE,
  META_FRAME_PAGE_VIEW_MESSAGE,
  META_FRAME_READY_MESSAGE,
  type MetaFrameParentMessage,
} from '@/lib/meta-tracking-protocol'
import { TRACKING_CONFIG } from '@/lib/tracking-config'
import { redactTrackingPath, sanitizeTrackingEvent } from '@/lib/tracking-policy'

type MetaFbq = {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded: boolean
  version: string
  push: MetaFbq
}

declare global {
  interface Window {
    fbq?: MetaFbq
    _fbq?: MetaFbq
  }
}

const META_SCRIPT_ID = 'ymi-meta-pixel-script'
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js'

const META_EVENT_NAMES: Record<string, string> = {
  view_catalog: 'ViewContent',
  start_personalization: 'CustomizeProduct',
  preview_ready: 'PreviewReady',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
}

let metaScriptPromise: Promise<void> | null = null

function getOrCreateFbq(): MetaFbq {
  if (window.fbq) return window.fbq

  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args)
      return
    }
    fbq.queue.push(args)
  }) as MetaFbq

  fbq.queue = []
  fbq.loaded = false
  fbq.version = '2.0'
  fbq.push = fbq
  window.fbq = fbq
  window._fbq = fbq
  return fbq
}

function ensureMetaPixel(pixelId: string) {
  if (metaScriptPromise) return metaScriptPromise

  const fbq = getOrCreateFbq()
  fbq('consent', 'revoke')
  fbq('set', 'autoConfig', false, pixelId)
  fbq('init', pixelId)

  metaScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(META_SCRIPT_ID) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') {
      resolve()
      return
    }

    const script = existing ?? document.createElement('script')
    script.id = META_SCRIPT_ID
    script.async = true
    script.src = META_SCRIPT_URL
    script.referrerPolicy = 'origin'
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      metaScriptPromise = null
      reject(new Error('Meta Pixel failed to load'))
    }, { once: true })

    if (!existing) document.head.appendChild(script)
  })

  return metaScriptPromise
}

function isSafePage(pagePath: unknown, pageTitle: unknown) {
  if (typeof pagePath !== 'string' || typeof pageTitle !== 'string') return false
  if (!pageTitle || pageTitle.length > 80) return false
  return redactTrackingPath(pagePath) === pagePath
}

export function MetaPixelFrame() {
  useEffect(() => {
    const pixelId = TRACKING_CONFIG.metaPixelId
    if (!pixelId || window.parent === window) return

    let consentGranted = false
    let scriptReady = false
    let active = true
    const pending: MetaFrameParentMessage[] = []

    const sendMessage = (message: MetaFrameParentMessage) => {
      if (!window.fbq || !consentGranted || !scriptReady) return

      if (message.type === META_FRAME_PAGE_VIEW_MESSAGE) {
        if (!isSafePage(message.page_path, message.page_title)) return
        window.fbq('trackSingle', pixelId, 'PageView', {
          page_path: message.page_path,
          page_title: message.page_title,
        })
        return
      }

      if (message.type === META_FRAME_EVENT_MESSAGE) {
        if (!isSafePage(message.page_path, message.page_title)) return
        const event = sanitizeTrackingEvent(message.event?.name, message.event?.payload)
        const metaEventName = event ? META_EVENT_NAMES[event.name] : null
        if (!event || !metaEventName) return

        window.fbq('trackSingle', pixelId, metaEventName, {
          ...event.payload,
          page_path: message.page_path,
          page_title: message.page_title,
        })
      }
    }

    const flushPending = () => {
      while (pending.length > 0 && consentGranted) {
        const message = pending.shift()
        if (message) sendMessage(message)
      }
    }

    const handleParentMessage = (event: MessageEvent<MetaFrameParentMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      const message = event.data
      if (!message || typeof message !== 'object') return

      if (message.type === META_FRAME_CONSENT_MESSAGE) {
        consentGranted = message.granted === true
        if (!consentGranted) {
          pending.length = 0
          window.fbq?.('consent', 'revoke')
          return
        }

        void ensureMetaPixel(pixelId)
          .then(() => {
            if (!active || !consentGranted) return
            window.fbq?.('consent', 'grant')
            scriptReady = true
            flushPending()
          })
          .catch(() => null)
        return
      }

      if (
        message.type !== META_FRAME_PAGE_VIEW_MESSAGE &&
        message.type !== META_FRAME_EVENT_MESSAGE
      ) {
        return
      }

      if (!consentGranted || !window.fbq || !scriptReady) {
        pending.push(message)
        return
      }

      sendMessage(message)
    }

    window.addEventListener('message', handleParentMessage)
    window.parent.postMessage(
      { type: META_FRAME_READY_MESSAGE },
      window.location.origin,
    )

    return () => {
      active = false
      window.removeEventListener('message', handleParentMessage)
    }
  }, [])

  return null
}
