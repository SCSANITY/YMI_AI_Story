import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeVoiceSampleChannels } from './voice-sample-quality'

const SAMPLE_RATE = 1000

function constantSample(value: number, seconds = 10) {
  return new Float32Array(SAMPLE_RATE * seconds).fill(value)
}

test('blocks silence and extremely quiet recordings', () => {
  assert.equal(analyzeVoiceSampleChannels([constantSample(0)], SAMPLE_RATE).blockingCode, 'near_silence')
  const quiet = constantSample(0.012)
  quiet[0] = 0.03
  assert.equal(analyzeVoiceSampleChannels([quiet], SAMPLE_RATE).blockingCode, 'too_quiet')
})

test('blocks recordings with sustained severe clipping', () => {
  const samples = constantSample(0.2)
  for (let index = 0; index < samples.length / 10; index += 1) samples[index] = 1
  const result = analyzeVoiceSampleChannels([samples], SAMPLE_RATE)
  assert.equal(result.blockingCode, 'severe_clipping')
  assert.equal(result.accepted, false)
})

test('accepts usable speech-like audio and keeps noise heuristics non-blocking', () => {
  const samples = new Float32Array(SAMPLE_RATE * 10)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = index % 1000 < 500 ? 0.18 : 0.025
  }
  const result = analyzeVoiceSampleChannels([samples], SAMPLE_RATE)
  assert.equal(result.accepted, true)
  assert.equal(result.blockingCode, null)
})

test('reports a possible background-noise warning without rejecting the sample', () => {
  const result = analyzeVoiceSampleChannels([constantSample(0.08)], SAMPLE_RATE)
  assert.equal(result.accepted, true)
  assert.equal(result.warningCode, 'possible_background_noise')
})
