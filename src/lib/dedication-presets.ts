import { DEDICATION_SAMPLE } from './dedication'

// Editorial starter copy for the 16 current catalog stories. This is a client-
// visible suggestion, never a persisted decision or a generation text override.
export const STORY_DEDICATION_PRESETS = {
  Adventure_story: 'May every map you follow lead you closer to wonder.\nTrust your brave heart, and know that you are loved wherever you go.',
  Birthdayboy_story: 'On your birthday, may you discover the gifts already growing within you.\nKeep sharing your courage, kindness, and joy with the world.',
  Birthdaygirl_story: 'On your birthday, may every color of your heart shine brightly.\nMay this new year bring you courage, kindness, and countless reasons to smile.',
  Breakfast_story: 'May each new morning remind you that you can learn, try, and begin again.\nYour courage and creativity make ordinary moments extraordinary.',
  Dinosaur_story: 'May your curiosity carry you across every age and every adventure.\nBe brave enough to explore, and gentle enough to care for the world you discover.',
  Explorer_story: 'May your curiosity open doors wherever you go.\nThe whole world is waiting for your brave, kind heart to explore it.',
  Food_story: 'May you never doubt how much a small, generous act can mean.\nMay your kindness grow and find its way to others.',
  Forest_story: 'May gratitude light your path, even on ordinary days.\nThe kindness you share will make every table feel a little warmer.',
  Glasses_story: 'May you always see the world in your own wonderful way.\nEvery new perspective is a chance to notice beauty, kindness, and possibility.',
  Music_story: 'May you always find your own rhythm and let your voice be heard.\nThe music you make can bring joy to everyone around you.',
  Noah_story: 'When storms come, may faith and hope help you find your way.\nYour courage and kindness can be a shelter for others too.',
  Planet_story: 'May you travel with courage and discover the good growing inside you.\nEvery new world is another chance to choose kindness.',
  Scientist_story: 'Keep asking questions and following the wonder in every small discovery.\nYour curious mind can brighten places you have not yet seen.',
  Seed_story: 'May the seeds of kindness and courage you plant today grow with you.\nYour small acts of love can make the world bloom.',
  Sister_story: 'May you always know there is room in your heart for new love and new adventures.\nThe care you share makes your family story beautiful.',
  Space_story: 'May your dreams reach farther than the stars.\nWherever your adventures take you, let friendship and courage guide your way.',
} as const

export function getDedicationPreset(storyTemplateId: string) {
  const id = storyTemplateId.trim()
  const storySpecific = Object.hasOwn(STORY_DEDICATION_PRESETS, id)
  return {
    body: storySpecific ? STORY_DEDICATION_PRESETS[id as keyof typeof STORY_DEDICATION_PRESETS] : DEDICATION_SAMPLE,
    storySpecific,
  }
}
