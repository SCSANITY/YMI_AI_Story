'use client'

import { useMemo, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { AdminButton, AdminNotice, AdminPanel, adminFieldClass } from '@/components/admin/AdminUi'
import { invalidateBookCatalogClientCache } from '@/components/useBookCatalog'
import type { BookPackagePricing, BookPackageType, HomeBookSectionKey } from '@/types'

export type CatalogPlacementTemplate = {
  templateId: string
  name: string
  isActive: boolean
  catalogDisplayPackageType: BookPackageType
  packagePricing: BookPackagePricing
}

export type CatalogHomeSection = {
  sectionKey: HomeBookSectionKey
  version: number
  templateIds: string[]
}

const SECTION_META: Array<{ key: HomeBookSectionKey; name: string }> = [
  { key: 'brand_new', name: 'Brand New' },
  { key: 'for_boys', name: 'For Boys' },
  { key: 'for_girls', name: 'For Girls' },
  { key: 'in_discount', name: 'In Discount' },
]

function normalizeSlots(templateIds: string[]) {
  return Array.from({ length: 4 }, (_, index) => templateIds[index] ?? '')
}

export function CatalogHomePlacementManager({
  templates,
  sections,
  onSectionSaved,
}: {
  templates: CatalogPlacementTemplate[]
  sections: CatalogHomeSection[]
  onSectionSaved: (section: CatalogHomeSection) => void
}) {
  const initialDrafts = useMemo(() => Object.fromEntries(
    SECTION_META.map(({ key }) => [key, normalizeSlots(sections.find((section) => section.sectionKey === key)?.templateIds ?? [])])
  ) as Record<HomeBookSectionKey, string[]>, [sections])
  const [drafts, setDrafts] = useState(initialDrafts)
  const [pending, setPending] = useState<Partial<Record<HomeBookSectionKey, boolean>>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Server refreshes remount this component through its versioned key in the parent.
  const updateSlot = (sectionKey: HomeBookSectionKey, slotIndex: number, templateId: string) => {
    setDrafts((current) => ({
      ...current,
      [sectionKey]: current[sectionKey].map((value, index) => index === slotIndex ? templateId : value),
    }))
    setError(null)
    setSuccess(null)
  }

  const save = async (sectionKey: HomeBookSectionKey) => {
    if (pending[sectionKey]) return
    const source = sections.find((section) => section.sectionKey === sectionKey)
    if (!source) return
    const templateIds = drafts[sectionKey].filter(Boolean)
    setPending((current) => ({ ...current, [sectionKey]: true }))
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/catalog/home-placements', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey, templateIds, expectedVersion: source.version }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !Number.isSafeInteger(data?.version)) {
        throw new Error(data?.error || 'Failed to update Home section')
      }
      const nextSection = { sectionKey, templateIds, version: data.version }
      setDrafts((current) => ({ ...current, [sectionKey]: normalizeSlots(templateIds) }))
      onSectionSaved(nextSection)
      invalidateBookCatalogClientCache()
      setSuccess(`${SECTION_META.find((section) => section.key === sectionKey)?.name} placements updated.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update Home section')
    } finally {
      setPending((current) => ({ ...current, [sectionKey]: false }))
    }
  }

  return (
    <AdminPanel className="p-4 sm:p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-accent)]">Home merchandising</p>
        <h2 className="mt-1 text-xl font-bold text-[var(--admin-page-ink)]">Four-slot story placements</h2>
      </div>

      {error ? <AdminNotice tone="danger" className="mt-4">{error}</AdminNotice> : null}
      {success ? <AdminNotice tone="success" className="mt-4">{success}</AdminNotice> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {SECTION_META.map((section) => {
          const values = drafts[section.key]
          const source = sections.find((candidate) => candidate.sectionKey === section.key)
          const normalizedValues = values.filter(Boolean)
          const dirty = JSON.stringify(normalizedValues) !== JSON.stringify(source?.templateIds ?? [])
          const isPending = Boolean(pending[section.key])

          return (
            <section key={section.key} className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-4">
              <h3 className="font-bold text-[var(--admin-page-ink)]">{section.name}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {values.map((value, slotIndex) => (
                  <label key={slotIndex} className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">
                    Slot {slotIndex + 1}
                    <select
                      value={value}
                      onChange={(event) => updateSlot(section.key, slotIndex, event.target.value)}
                      className={adminFieldClass}
                      disabled={isPending}
                    >
                      <option value="">Empty</option>
                      {templates.map((template) => {
                        const selectedElsewhere = values.some((selected, index) => index !== slotIndex && selected === template.templateId)
                        const displayPrice = template.packagePricing[template.catalogDisplayPackageType]
                        const lacksDisplaySale = section.key === 'in_discount' && displayPrice.salePriceUsd === null
                        const unavailable = !template.isActive || selectedElsewhere || lacksDisplaySale
                        return (
                          <option
                            key={template.templateId}
                            value={template.templateId}
                            disabled={unavailable}
                          >
                            {template.name}{template.isActive ? '' : ' (inactive)'}{lacksDisplaySale ? ' - no display sale' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end border-t border-[var(--admin-line)] pt-4">
                <AdminButton type="button" tone="primary" disabled={!source || !dirty || isPending} onClick={() => void save(section.key)}>
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save section
                </AdminButton>
              </div>
            </section>
          )
        })}
      </div>
    </AdminPanel>
  )
}
