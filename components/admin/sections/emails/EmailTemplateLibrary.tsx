'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookOpenText,
  ExternalLink,
  Monitor,
  PenLine,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { AdminStatusBadge } from '@/components/admin/AdminUi'
import type {
  EmailTemplateCategory,
  EmailTemplateDefinition,
} from '@/lib/email-template-catalog'

const CATEGORY_LABELS: Record<EmailTemplateCategory | 'all', string> = {
  all: 'All',
  security: 'Security',
  orders: 'Orders',
  delivery: 'Delivery',
  subscriptions: 'Subscriptions',
  human: 'Human Communication',
}

const OWNERSHIP_LABELS: Record<EmailTemplateDefinition['ownership'], string> = {
  web: 'YMI template',
  supabase: 'Supabase managed',
  stripe: 'Stripe managed',
  admin_composer: 'Admin composed',
}

const MODE_LABELS: Record<EmailTemplateDefinition['triggerMode'], string> = {
  automatic: 'Automatic',
  workflow: 'Workflow action',
  human: 'Human authored',
}

export function EmailTemplateLibrary({
  templates,
  selectedTemplate,
  selectedVariantId,
  previewHtml,
}: {
  templates: readonly EmailTemplateDefinition[]
  selectedTemplate: EmailTemplateDefinition
  selectedVariantId: string | null
  previewHtml: string | null
}) {
  const [category, setCategory] = useState<EmailTemplateCategory | 'all'>('all')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const visibleTemplates =
    category === 'all' ? templates : templates.filter((template) => template.category === category)

  return (
    <div className="space-y-4">
      <div className="admin-v2-panel flex gap-1 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Template categories">
        {(['all', 'security', 'orders', 'delivery', 'subscriptions', 'human'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
              category === item
                ? 'bg-[var(--admin-accent)] text-white shadow-sm'
                : 'text-[var(--admin-page-muted)] hover:bg-black/[0.04]'
            }`}
          >
            {CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="admin-v2-panel overflow-hidden" aria-label="Email template list">
          <div className="border-b border-black/[0.06] px-4 py-3">
            <p className="text-xs text-[var(--admin-page-muted)]">
              {visibleTemplates.length} template {visibleTemplates.length === 1 ? 'family' : 'families'}
            </p>
          </div>
          <div className="max-h-[720px] space-y-1 overflow-y-auto p-2">
            {visibleTemplates.map((template) => {
              const selected = template.id === selectedTemplate.id
              const defaultVariant = template.variants[0]?.id
              const href = defaultVariant
                ? `/admin/emails?view=templates&template=${encodeURIComponent(template.id)}&variant=${encodeURIComponent(defaultVariant)}`
                : `/admin/emails?view=templates&template=${encodeURIComponent(template.id)}`
              return (
                <Link
                  key={template.id}
                  href={href}
                  aria-current={selected ? 'true' : undefined}
                  className={`block rounded-xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
                    selected
                      ? 'border-[#e0ad60] bg-[#fff8e9] shadow-sm'
                      : 'border-transparent hover:border-black/[0.07] hover:bg-black/[0.025]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--admin-page-ink)]">{template.name}</p>
                      <p className="mt-1 text-xs text-[var(--admin-page-muted)]">{CATEGORY_LABELS[template.category]}</p>
                    </div>
                    {template.variants.length > 0 ? (
                      <BookOpenText className="h-4 w-4 shrink-0 text-[var(--admin-accent-dp)]" aria-label="Preview available" />
                    ) : (
                      <ExternalLink className="h-4 w-4 shrink-0 text-[var(--admin-page-muted)]" aria-label="External or freeform template" />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <AdminStatusBadge tone={template.triggerMode === 'automatic' ? 'success' : template.triggerMode === 'workflow' ? 'info' : 'neutral'}>
                      {MODE_LABELS[template.triggerMode]}
                    </AdminStatusBadge>
                    <AdminStatusBadge tone="neutral">{OWNERSHIP_LABELS[template.ownership]}</AdminStatusBadge>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="admin-v2-panel min-w-0 overflow-hidden" aria-labelledby="selected-email-template">
          <div className="border-b border-black/[0.06] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="selected-email-template" className="text-xl font-bold text-[var(--admin-page-ink)]">
                    {selectedTemplate.name}
                  </h2>
                  <AdminStatusBadge tone="neutral">Read only</AdminStatusBadge>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-page-muted)]">
                  {selectedTemplate.description}
                </p>
              </div>
              {previewHtml ? (
                <div className="flex w-fit rounded-lg bg-black/[0.05] p-1" aria-label="Preview width">
                  <DeviceButton label="Desktop" selected={device === 'desktop'} onClick={() => setDevice('desktop')} icon={Monitor} />
                  <DeviceButton label="Mobile" selected={device === 'mobile'} onClick={() => setDevice('mobile')} icon={Smartphone} />
                </div>
              ) : null}
            </div>

            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <TemplateDetail label="Trigger" value={selectedTemplate.trigger} />
              <TemplateDetail label="Subject" value={selectedTemplate.subject} />
              <TemplateDetail label="Sender" value={selectedTemplate.sender} />
              <TemplateDetail label="Event key" value={selectedTemplate.emailKey} mono />
            </dl>

            {selectedTemplate.variants.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Template variants">
                {selectedTemplate.variants.map((variant) => (
                  <Link
                    key={variant.id}
                    href={`/admin/emails?view=templates&template=${encodeURIComponent(selectedTemplate.id)}&variant=${encodeURIComponent(variant.id)}`}
                    aria-current={selectedVariantId === variant.id ? 'true' : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
                      selectedVariantId === variant.id
                        ? 'bg-[var(--admin-page-ink)] text-white'
                        : 'bg-black/[0.05] text-[var(--admin-page-muted)] hover:bg-black/[0.08]'
                    }`}
                  >
                    {variant.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {previewHtml ? (
            <div className="bg-[#ddd8ce] p-3 sm:p-5">
              <div
                className={`mx-auto overflow-hidden bg-white shadow-xl transition-[width,border-radius] duration-200 ${
                  device === 'mobile'
                    ? 'h-[680px] w-full max-w-[390px] rounded-[26px] border-[8px] border-[#292722]'
                    : 'h-[720px] w-full rounded-xl border border-black/10'
                }`}
              >
                <iframe
                  key={`${selectedTemplate.id}:${selectedVariantId}:${device}`}
                  title={`${selectedTemplate.name} ${device} preview`}
                  srcDoc={previewHtml}
                  sandbox=""
                  className="h-full w-full border-0 bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center p-6">
              <div className="max-w-md text-center">
                {selectedTemplate.ownership === 'admin_composer' ? (
                  <PenLine className="mx-auto h-8 w-8 text-[var(--admin-accent-dp)]" aria-hidden="true" />
                ) : (
                  <ExternalLink className="mx-auto h-8 w-8 text-[var(--admin-accent-dp)]" aria-hidden="true" />
                )}
                <h3 className="mt-4 font-bold text-[var(--admin-page-ink)]">
                  {selectedTemplate.ownership === 'admin_composer' ? 'No fixed template' : 'Managed outside YMI Web'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--admin-page-muted)]">
                  {selectedTemplate.ownership === 'admin_composer'
                    ? 'The Admin composer supplies the subject and body for each message, so there is no canonical visual preview.'
                    : 'This catalog records the trigger and ownership without presenting a stale imitation of the provider template.'}
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#fff8e9] px-3 py-1.5 text-xs font-semibold text-[#7b5a28]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  No editable controls
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function DeviceButton({
  label,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string
  selected: boolean
  onClick: () => void
  icon: typeof Monitor
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
        selected ? 'bg-white text-[var(--admin-page-ink)] shadow-sm' : 'text-[var(--admin-page-muted)]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

function TemplateDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-black/[0.03] p-3">
      <dt className="font-semibold text-[var(--admin-page-muted)]">{label}</dt>
      <dd className={`mt-1.5 break-words leading-5 text-[var(--admin-page-ink)] ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
