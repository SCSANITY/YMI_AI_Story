'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { EmailTemplateDefinition, EmailTemplatePreviewVariant } from '@/lib/email-template-catalog'
import type { SampleControls } from '@/lib/email-book-samples'

export function templateHref(template: string, variant?: string, category?: string) {
  const query = new URLSearchParams({ view: 'templates', template })
  if (variant) query.set('variant', variant)
  if (category) query.set('category', category)
  return '/admin/emails?' + query
}

const fields: (keyof SampleControls)[] = ['Order', 'Edition', 'Format', 'Books', 'Recording']
const choiceClass = 'inline-flex min-h-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs leading-tight focus-visible:outline-2 focus-visible:outline-offset-2'
function Choices({ options, href, selected }: {
  options: { id: string; label: string }[]
  href: (id: string) => string
  selected: string
}) {
  return <div className="flex flex-wrap gap-1">
    {options.map(option => <Link key={option.id} scroll={false} prefetch={false} href={href(option.id)}
      aria-current={option.id === selected ? 'true' : undefined}
      className={choiceClass + (option.id === selected
        ? ' border-[var(--admin-page-muted)] bg-white font-bold shadow-sm'
        : ' border-transparent font-medium text-[var(--admin-page-muted)] hover:bg-white/80')}>
      {option.label}{option.id === selected && <Check size={14} className="text-[var(--admin-accent-dp)]" aria-hidden />}
    </Link>)}
  </div>
}

export function TemplateScenarioSelector({ template, variant, href }: {
  template: EmailTemplateDefinition
  variant: EmailTemplatePreviewVariant
  href: (id: string) => string
}) {
  const router = useRouter()
  if (template.variants.length < 2) return null
  const controls = variant.controls
  const rows = fields.filter(field => controls?.[field])
  const rowClass = 'flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-3'
  const labelClass = 'shrink-0 text-xs font-semibold sm:w-20'
  return <div className="mt-3 divide-y divide-black/[0.05] rounded-xl bg-[#f5f2ec] px-3 py-1">
    {!controls && <div className={rowClass}><span className={labelClass}>{template.id === 'unpaid-reminder' ? 'Stage' : 'Event'}</span>
      <Choices options={[...template.variants]} selected={variant.id} href={href} /></div>}
    {rows.map((field, index) => {
      const group = template.variants.filter(item => rows.slice(0, index).every(key => item.controls?.[key] === controls?.[key]))
      const values = [...new Set(group.map(item => item.controls?.[field]).filter((v): v is string => Boolean(v)))]
      if (field === 'Format') values.sort((a,b) => ['PDF Only','Hardcover','Hardcover + Voice'].indexOf(a) - ['PDF Only','Hardcover','Hardcover + Voice'].indexOf(b))
      const options = values.map(value => {
        const candidates = group.filter(item => item.controls?.[field] === value)
        // Keep compatible choices when switching edition, format or order composition.
        const score = (item: EmailTemplatePreviewVariant) => rows.slice(index+1).filter(key => item.controls?.[key] === controls?.[key]).length
        const best = candidates.reduce((a,b) => score(b) > score(a) ? b : a)
        return { id: best.id, label: value }
      })
      return <div key={field} className={rowClass}>
        <span id={'sample-' + field} className={labelClass}>{field}</span>
        {field === 'Books' ? <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select aria-labelledby="sample-Books" value={variant.id}
            onChange={event => router.push(href(event.target.value), { scroll: false })}
            className="max-w-full rounded-md border bg-white px-2 py-1.5 text-sm">
            {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select><span className="text-xs text-[var(--admin-page-muted)]">Personalised</span></div>
          : <div role="group" aria-labelledby={'sample-' + field}><Choices options={options} selected={variant.id} href={href} /></div>}
      </div>
    })}
  </div>
}

