export type PhotoPhase = 'loading' | 'checking' | 'preparing'
export type PhotoFailure = 'unreadable' | 'heic-undecodable' | 'no-face' | 'multiple-faces'
  | 'incomplete-face' | 'unmeasurable-face' | 'covered-features' | 'technical' | 'saved-photo-unavailable'

export type InspectionResult = { file: File } | { reason: PhotoFailure }
export type WorkerRequest = { type: 'warmup' } | { type: 'inspect'; id: number; file: File }
export type WorkerResponse =
  | { type: 'phase'; id: number; phase: PhotoPhase }
  | { type: 'result'; id: number; result: InspectionResult }
