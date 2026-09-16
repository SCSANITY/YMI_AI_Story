import type { PersonalizeFormDraft, PersonalizeFormStep } from '@/lib/personalize-form-draft'

// Catalogue visits start at Product Intro; reloads and explicit resumes keep
// their draft position. The URL marker is consumed during initialization.
export function buildPersonalizeIntroHref(bookId: string) {
  return `/personalize/${encodeURIComponent(bookId)}?entry=intro`
}

export function resolvePersonalizeEntryStep(
  draft: PersonalizeFormDraft | null,
  productIntroEntry = false
): PersonalizeFormStep {
  if (productIntroEntry || !draft || draft.step === 'INTRO') return 'INTRO'
  return draft.faceAssetId ? draft.step : 'PHOTO'
}
