import type { StoryLanguage } from '@/types'
import {
  normalizePurchasePackageType,
  type PurchasePackageType,
} from '@/lib/purchase-configuration'

export type PersonalizeFormStep = 'INTRO' | 'PHOTO' | 'DETAILS' | 'REVIEW'

export type PersonalizeFormDraft = {
  version: 1
  ownerKey: string
  step: PersonalizeFormStep
  name: string
  age: string
  language: StoryLanguage
  bookType: PurchasePackageType
  faceAssetId: string | null
  faceStoragePath: string | null
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>

const draftStorageKey = (bookId: string) => `ymi_personalize_form_draft_${bookId}`

const isFormStep = (value: unknown): value is PersonalizeFormStep => (
  value === 'INTRO' || value === 'PHOTO' || value === 'DETAILS' || value === 'REVIEW'
)

const isStoryLanguage = (value: unknown): value is StoryLanguage => (
  value === 'English'
  || value === 'Simplified Chinese'
  || value === 'Traditional Chinese'
  || value === 'Spanish'
)

export function readPersonalizeFormDraft(
  storage: DraftStorage,
  bookId: string,
  ownerKey: string
): PersonalizeFormDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(bookId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersonalizeFormDraft>
    if (parsed.version !== 1 || parsed.ownerKey !== ownerKey || !isFormStep(parsed.step)) {
      return null
    }

    const bookType = normalizePurchasePackageType(parsed.bookType) ?? 'basic'
    return {
      version: 1,
      ownerKey,
      step: parsed.step,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      age: typeof parsed.age === 'string' ? parsed.age : '',
      language: isStoryLanguage(parsed.language) ? parsed.language : 'English',
      bookType,
      faceAssetId: typeof parsed.faceAssetId === 'string' && parsed.faceAssetId
        ? parsed.faceAssetId
        : null,
      faceStoragePath: typeof parsed.faceStoragePath === 'string' && parsed.faceStoragePath
        ? parsed.faceStoragePath
        : null,
    }
  } catch {
    return null
  }
}

export function writePersonalizeFormDraft(
  storage: DraftStorage,
  bookId: string,
  draft: PersonalizeFormDraft
) {
  storage.setItem(draftStorageKey(bookId), JSON.stringify(draft))
}
