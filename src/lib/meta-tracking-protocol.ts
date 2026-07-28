import type { SafeTrackingEvent } from '@/lib/tracking-policy'

export const META_FRAME_READY_MESSAGE = 'ymi:meta-frame-ready'
export const META_FRAME_CONSENT_MESSAGE = 'ymi:meta-frame-consent'
export const META_FRAME_PAGE_VIEW_MESSAGE = 'ymi:meta-frame-page-view'
export const META_FRAME_EVENT_MESSAGE = 'ymi:meta-frame-event'

export type MetaFrameReadyMessage = {
  type: typeof META_FRAME_READY_MESSAGE
}

export type MetaFrameParentMessage =
  | {
      type: typeof META_FRAME_CONSENT_MESSAGE
      granted: boolean
    }
  | {
      type: typeof META_FRAME_PAGE_VIEW_MESSAGE
      page_path: string
      page_title: string
    }
  | {
      type: typeof META_FRAME_EVENT_MESSAGE
      event: SafeTrackingEvent
      page_path: string
      page_title: string
    }
