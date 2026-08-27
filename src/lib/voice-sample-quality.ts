export type VoiceSampleQualityCode =
  | 'near_silence'
  | 'too_quiet'
  | 'severe_clipping'
  | 'possible_background_noise'

export type VoiceSampleQualityResult = {
  accepted: boolean
  blockingCode: Exclude<VoiceSampleQualityCode, 'possible_background_noise'> | null
  warningCode: Extract<VoiceSampleQualityCode, 'possible_background_noise'> | null
  metrics: {
    peak: number
    rms: number
    clippingRatio: number
    noiseFloorRatio: number
  }
}

const NEAR_SILENCE_PEAK = 0.025
const NEAR_SILENCE_RMS = 0.008
const MIN_USABLE_RMS = 0.018
const CLIPPING_LEVEL = 0.995
const SEVERE_CLIPPING_RATIO = 0.05
const BACKGROUND_NOISE_RATIO = 0.35

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))
  return sorted[index] ?? 0
}

export function analyzeVoiceSampleChannels(
  channels: ReadonlyArray<Float32Array>,
  sampleRate: number
): VoiceSampleQualityResult {
  const validChannels = channels.filter((channel) => channel.length > 0)
  if (!validChannels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return {
      accepted: false,
      blockingCode: 'near_silence',
      warningCode: null,
      metrics: { peak: 0, rms: 0, clippingRatio: 0, noiseFloorRatio: 0 },
    }
  }

  const sampleCount = validChannels.reduce((count, channel) => count + channel.length, 0)
  let peak = 0
  let sumSquares = 0
  let clippedSamples = 0

  for (const channel of validChannels) {
    for (let index = 0; index < channel.length; index += 1) {
      const absolute = Math.abs(channel[index] ?? 0)
      peak = Math.max(peak, absolute)
      sumSquares += absolute * absolute
      if (absolute >= CLIPPING_LEVEL) clippedSamples += 1
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount))
  const clippingRatio = clippedSamples / Math.max(1, sampleCount)

  const frameSize = Math.max(1, Math.round(sampleRate * 0.02))
  const referenceChannel = validChannels[0]
  const frameRms: number[] = []
  for (let start = 0; start < referenceChannel.length; start += frameSize) {
    const end = Math.min(referenceChannel.length, start + frameSize)
    let frameSquares = 0
    for (let index = start; index < end; index += 1) {
      const value = referenceChannel[index] ?? 0
      frameSquares += value * value
    }
    frameRms.push(Math.sqrt(frameSquares / Math.max(1, end - start)))
  }
  const quietFloor = percentile(frameRms, 0.2)
  const speechLevel = percentile(frameRms, 0.9)
  const noiseFloorRatio = speechLevel > 0 ? quietFloor / speechLevel : 0

  let blockingCode: VoiceSampleQualityResult['blockingCode'] = null
  if (peak < NEAR_SILENCE_PEAK || rms < NEAR_SILENCE_RMS) {
    blockingCode = 'near_silence'
  } else if (rms < MIN_USABLE_RMS) {
    blockingCode = 'too_quiet'
  } else if (clippingRatio >= SEVERE_CLIPPING_RATIO) {
    blockingCode = 'severe_clipping'
  }

  const warningCode =
    !blockingCode && speechLevel >= MIN_USABLE_RMS && noiseFloorRatio >= BACKGROUND_NOISE_RATIO
      ? 'possible_background_noise'
      : null

  return {
    accepted: !blockingCode,
    blockingCode,
    warningCode,
    metrics: { peak, rms, clippingRatio, noiseFloorRatio },
  }
}

export async function analyzeVoiceSampleBlob(blob: Blob) {
  if (typeof AudioContext === 'undefined') {
    throw new Error('Audio analysis is not supported in this browser')
  }
  const context = new AudioContext()
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer())
    const channels = Array.from(
      { length: audio.numberOfChannels },
      (_, index) => audio.getChannelData(index)
    )
    return {
      durationSeconds: audio.duration,
      quality: analyzeVoiceSampleChannels(channels, audio.sampleRate),
    }
  } finally {
    await context.close().catch(() => undefined)
  }
}
