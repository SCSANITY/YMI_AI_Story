'use client'

import { memo } from 'react'
import { Check, Heart, Shield, Sparkles, Star, type LucideIcon } from 'lucide-react'
import type { MagicAttribute } from '@/types'

type MagicAttributesPanelProps = {
  attributes: MagicAttribute[]
  heading: string
  translateAttribute: (key: string) => string
}

const ATTRIBUTE_KEYS: Record<string, { key: string; Icon: LucideIcon; iconClassName: string; barClassName: string }> = {
  'grace and beauty': { key: 'personalize.magicAttribute.graceAndBeauty', Icon: Sparkles, iconClassName: 'text-rose-400', barClassName: 'bg-rose-400' },
  'goodness and virtue': { key: 'personalize.magicAttribute.goodnessAndVirtue', Icon: Heart, iconClassName: 'text-pink-400', barClassName: 'bg-pink-400' },
  'hope and resilience': { key: 'personalize.magicAttribute.hopeAndResilience', Icon: Shield, iconClassName: 'text-blue-400', barClassName: 'bg-blue-400' },
  'love and connection': { key: 'personalize.magicAttribute.loveAndConnection', Icon: Heart, iconClassName: 'text-red-400', barClassName: 'bg-red-400' },
  'truth and integrity': { key: 'personalize.magicAttribute.truthAndIntegrity', Icon: Check, iconClassName: 'text-emerald-400', barClassName: 'bg-emerald-400' },
  'faith and trust': { key: 'personalize.magicAttribute.faithAndTrust', Icon: Star, iconClassName: 'text-amber-400', barClassName: 'bg-amber-400' },
}

const DEFAULT_ATTRIBUTE_DISPLAY = {
  Icon: Sparkles,
  iconClassName: 'text-purple-400',
  barClassName: 'bg-purple-400',
}

function MagicAttributesPanelComponent({
  attributes,
  heading,
  translateAttribute,
}: MagicAttributesPanelProps) {
  if (!attributes.length) return null

  return (
    <section aria-labelledby="magic-attributes-heading" className="border-t border-slate-200 pt-4">
      <h2
        id="magic-attributes-heading"
        className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700"
      >
        {heading}
      </h2>
      <div className="mt-3 grid w-full max-w-[520px] gap-x-6 gap-y-3 sm:grid-cols-2">
        {attributes.map((attribute) => {
          const normalized = attribute.label.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ')
          const match = ATTRIBUTE_KEYS[normalized]
          const display = match ?? DEFAULT_ATTRIBUTE_DISPLAY
          const Icon = display.Icon
          const label = match ? translateAttribute(match.key) : attribute.label
          const percent = Math.max(0, Math.min(100, attribute.percent))

          return (
            <div
              key={`${attribute.label}-${attribute.percent}`}
              className="min-w-0"
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${display.iconClassName}`} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
              </div>
              <div
                className="h-3.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className={`h-full rounded-full ${display.barClassName}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const MagicAttributesPanel = memo(MagicAttributesPanelComponent)
