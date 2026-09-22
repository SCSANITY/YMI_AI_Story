import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEDICATION_SAMPLE, dedicationBodyMetrics, validDedicationBody } from './dedication'
import { getDedicationPreset, STORY_DEDICATION_PRESETS } from './dedication-presets'

const currentStoryIds = [
  'Adventure_story', 'Birthdayboy_story', 'Birthdaygirl_story', 'Breakfast_story',
  'Dinosaur_story', 'Explorer_story', 'Food_story', 'Forest_story',
  'Glasses_story', 'Music_story', 'Noah_story', 'Planet_story',
  'Scientist_story', 'Seed_story', 'Sister_story', 'Space_story',
]

test('all 16 current stories have distinct, valid, formatted suggestions', () => {
  assert.deepEqual(Object.keys(STORY_DEDICATION_PRESETS).sort(), currentStoryIds)
  assert.equal(new Set(Object.values(STORY_DEDICATION_PRESETS)).size, currentStoryIds.length)
  for (const storyId of currentStoryIds) {
    const preset = getDedicationPreset(storyId)
    assert.equal(preset.storySpecific, true)
    assert.equal(validDedicationBody(preset.body), true, storyId)
    assert.equal(dedicationBodyMetrics(preset.body).lineBreaks, 1, storyId)
  }
})

test('an unknown future story gets the generic suggestion without a false story label', () => {
  assert.deepEqual(getDedicationPreset('Future_story'), { body: DEDICATION_SAMPLE, storySpecific: false })
  assert.deepEqual(getDedicationPreset(' toString '), { body: DEDICATION_SAMPLE, storySpecific: false })
})
