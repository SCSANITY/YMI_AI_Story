'use client'

import { memo } from 'react'
import { Heart, ShieldCheck, Sparkles, Star } from 'lucide-react'
import type { MagicAttribute } from '@/types'

type MagicAttributesPanelProps = {
  attributes: MagicAttribute[]
  heading: string
  translateAttribute: (key: string) => string
}

const ATTRIBUTE_KEYS: Record<string, { key: string; Icon: typeof Sparkles }> = {
  'grace and beauty': { key: 'personalize.magicAttribute.graceAndBeauty', Icon: Sparkles },
  'goodness and virtue': { key: 'personalize.magicAttribute.goodnessAndVirtue', Icon: Heart },
  'hope and resilience': { key: 'personalize.magicAttribute.hopeAndResilience', Icon: ShieldCheck },
  'love and connection': { key: 'personalize.magicAttribute.loveAndConnection', Icon: Heart },
  'truth and integrity': { key: 'personalize.magicAttribute.truthAndIntegrity', Icon: ShieldCheck },
  'faith and trust': { key: 'personalize.magicAttribute.faithAndTrust', Icon: Star },
}

function MagicAttributesPanelComponent({
  attributes,
  heading,
  translateAttribute,
}: MagicAttributesPanelProps) {
  if (!attributes.length) return null

  return (
    <section aria-labelledby="magic-attributes-heading" className="pt-1">
      <h2
        id="magic-attributes-heading"
        className="font-serif text-xl font-bold text-slate-950"
      >
        {heading}
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {attributes.slice(0, 4).map((attribute) => {
          const normalized = attribute.label.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ')
          const match = ATTRIBUTE_KEYS[normalized]
          const Icon = match?.Icon ?? Sparkles
          const label = match ? translateAttribute(match.key) : attribute.label

          return (
            <div
              key={`${attribute.label}-${attribute.percent}`}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-amber-100 bg-white px-3.5 py-3 shadow-[0_10px_24px_-22px_rgba(120,53,15,0.55)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 text-sm font-semibold leading-5 text-slate-700">{label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const MagicAttributesPanel = memo(MagicAttributesPanelComponent)
