import type { MaterialItem } from '@/lib/order-materials'

type Format = MaterialItem['package_type']
type Edition = NonNullable<MaterialItem['edition']>
export type SampleControls = Partial<Record<'Order' | 'Edition' | 'Format' | 'Books' | 'Recording', string>>
export type BookSample = {
  id: string
  label: string
  controls: SampleControls
  edition: Edition
  formats: Format[]
  missing: number
}

const formats: Format[] = ['basic', 'supreme', 'digital']
const editions: Edition[] = ['personalised', 'original']
const formatLabels = { digital: 'PDF Only', basic: 'Hardcover', supreme: 'Hardcover + Voice' }
const editionLabels = { personalised: 'Personalised', original: 'Standard' }

function singleSample(edition: Edition, format: Format, id: string): BookSample {
  const controls = { Edition: editionLabels[edition], Format: formatLabels[format] }
  return { id, controls, edition, formats: [format], missing: 0, label: Object.values(controls).join(' · ') }
}

export const deliverySamples = editions.flatMap(edition => formats.map(format => {
  const legacyId = format === 'basic' ? 'default' : 'voice'
  const id = edition === 'personalised' && format !== 'digital' ? legacyId : edition + '-' + format
  return singleSample(edition, format, id)
}))

export const printSamples = deliverySamples.filter(sample => sample.formats[0] !== 'digital')

function receiptSamples(sample: BookSample, order: string): BookSample[] {
  const count = sample.formats.filter(format => format === 'supreme').length
  const base = { ...sample, controls: { Order: order, ...sample.controls } }
  if (!count) return [base]
  return Array.from({ length: count + 1 }, (_, i) => {
    const missing = count - i
    const state = count === 1 ? 'Needed' : missing + ' needed'
    const recording = missing ? state : 'Received'
    const suffix = missing === 0 ? 'ready' : missing === count ? 'pending' : 'partial'
    return { ...base, missing, id: base.id + '-' + suffix, controls: { ...base.controls, Recording: recording },
      label: base.label + ' · ' + recording }
  })
}

const mixedFormats: Format[][] = [
  ['basic', 'supreme'], ['digital', 'basic'], ['digital', 'supreme'], ['supreme', 'supreme'],
]
export const confirmationSamples = [
  ...deliverySamples.flatMap(sample => receiptSamples(sample, 'Single book')),
  ...mixedFormats.flatMap(formats => {
    const label = formats[0] === formats[1] ? formatLabels[formats[0]] + ' × 2'
      : formats.map(format => formatLabels[format] + ' × 1').join(', ')
    const id = formats[0] === 'basic' ? 'mixed-voice' : 'mixed-' + formats.join('-')
    return receiptSamples({ id, edition: 'personalised', formats, missing: 0, label, controls: { Books: label } }, 'Mixed order')
  }),
]

export function sampleBooks(sample: BookSample) {
  return sample.formats.map((format, index) => {
    const mia = format === 'supreme' && (index === 0 || sample.formats[0] !== 'supreme')
    const child = mia ? 'Mia' : 'Sophie'
    const story = mia ? 'Space Mission' : 'Secret Journey Through Eight Plants'
    const original = sample.edition === 'original'
    const unitPrice = original ? { basic: 38, supreme: 70, digital: 4.9 }[format]
      : { basic: 36, supreme: 59, digital: 9.9 }[format]
    return { name: original ? story : child + "'s " + story, child_name: original ? null : child,
      edition: sample.edition, package_type: format, quantity: 1, unitPrice }
  })
}

