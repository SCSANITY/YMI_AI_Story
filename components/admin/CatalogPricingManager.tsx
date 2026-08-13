'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, LoaderCircle, RefreshCw, Search, Tag } from 'lucide-react'
import Image from 'next/image'
import {
  AdminButton,
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'
import type { BookPackagePrice, BookPackagePricing, BookPackageType } from '@/types'
import {
  CatalogHomePlacementManager,
  type CatalogHomeSection,
} from '@/components/admin/CatalogHomePlacementManager'

type CatalogTemplate = {
  templateId: string
  name: string
  isActive: boolean
  coverUrl: string
  catalogDisplayPackageType: BookPackageType
  packagePricing: BookPackagePricing
}

type PriceDraft = {
  listPriceUsd: string
  salePriceUsd: string
  displayDiscountPercent: string
}

const PACKAGE_META: Array<{
  type: BookPackageType
  name: string
  description: string
}> = [
  { type: 'digital', name: 'Cloud Explorer', description: 'Digital PDF edition' },
  { type: 'basic', name: 'Classic Portrait', description: 'Personalized printed book' },
  { type: 'supreme', name: 'Signature Voice', description: 'Printed book with voice experience' },
]

function draftFromPrice(price: BookPackagePrice): PriceDraft {
  return {
    listPriceUsd: price.listPriceUsd.toFixed(2),
    salePriceUsd: price.salePriceUsd?.toFixed(2) ?? '',
    displayDiscountPercent: price.displayDiscountPercent?.toString() ?? '',
  }
}

function pricingDrafts(template: CatalogTemplate) {
  return Object.fromEntries(
    PACKAGE_META.map(({ type }) => [type, draftFromPrice(template.packagePricing[type])])
  ) as Record<BookPackageType, PriceDraft>
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function CatalogPricingManager() {
  const [templates, setTemplates] = useState<CatalogTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<BookPackageType, PriceDraft> | null>(null)
  const [displayPackageDraft, setDisplayPackageDraft] = useState<BookPackageType>('digital')
  const [homeSections, setHomeSections] = useState<CatalogHomeSection[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingPackages, setPendingPackages] = useState<Record<BookPackageType, boolean>>({
    digital: false,
    basic: false,
    supreme: false,
  })
  const [displayPackagePending, setDisplayPackagePending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const loadIntentRef = useRef(0)
  const selectedTemplateIdRef = useRef<string | null>(null)
  const saveIntentRef = useRef<Record<BookPackageType, number>>({ digital: 0, basic: 0, supreme: 0 })

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.templateId === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  )

  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return templates
    return templates.filter((template) =>
      `${template.name} ${template.templateId}`.toLowerCase().includes(normalized)
    )
  }, [query, templates])
  const hasPendingPackage = Object.values(pendingPackages).some(Boolean)
  const hasPendingWrite = hasPendingPackage || displayPackagePending
  const inDiscountTemplateIds = useMemo(
    () => new Set(homeSections.find((section) => section.sectionKey === 'in_discount')?.templateIds ?? []),
    [homeSections]
  )
  const selectedIsInDiscount = selectedTemplate ? inDiscountTemplateIds.has(selectedTemplate.templateId) : false
  const selectedDisplayPackageBlocked = Boolean(
    selectedTemplate
    && selectedIsInDiscount
    && selectedTemplate.packagePricing[displayPackageDraft].salePriceUsd === null
  )
  const applyAllDisplayPackageBlocked = templates.some((template) =>
    inDiscountTemplateIds.has(template.templateId)
    && template.packagePricing[displayPackageDraft].salePriceUsd === null
  )

  const load = useCallback(async () => {
    const intent = ++loadIntentRef.current
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/pricing', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (loadIntentRef.current !== intent) return
      if (!response.ok || !Array.isArray(data?.templates)) {
        throw new Error(data?.error || 'Failed to load catalog pricing')
      }
      const nextTemplates = data.templates as CatalogTemplate[]
      const nextHomeSections = Array.isArray(data?.homeSections) ? data.homeSections as CatalogHomeSection[] : []
      setTemplates(nextTemplates)
      setHomeSections(nextHomeSections)
      const currentId = selectedTemplateIdRef.current
      const nextSelected =
        (currentId && nextTemplates.find((template) => template.templateId === currentId))
        || nextTemplates[0]
        || null
      const nextSelectedId = nextSelected?.templateId ?? null
      selectedTemplateIdRef.current = nextSelectedId
      setSelectedTemplateId(nextSelectedId)
      setDrafts(nextSelected ? pricingDrafts(nextSelected) : null)
      setDisplayPackageDraft(nextSelected?.catalogDisplayPackageType ?? 'digital')
    } catch (loadError) {
      if (loadIntentRef.current !== intent) return
      setError(loadError instanceof Error ? loadError.message : 'Failed to load catalog pricing')
    } finally {
      if (loadIntentRef.current === intent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateDraft = (packageType: BookPackageType, field: keyof PriceDraft, value: string) => {
    setDrafts((current) => current ? {
      ...current,
      [packageType]: {
        ...current[packageType],
        [field]: value,
        ...(field === 'salePriceUsd' && !value ? { displayDiscountPercent: '' } : {}),
      },
    } : current)
    setError(null)
    setSuccess(null)
  }

  const savePackage = async (packageType: BookPackageType) => {
    if (!selectedTemplate || !drafts || pendingPackages[packageType]) return
    const intent = ++saveIntentRef.current[packageType]
    setPendingPackages((current) => ({ ...current, [packageType]: true }))
    setError(null)
    setSuccess(null)

    try {
      const source = selectedTemplate.packagePricing[packageType]
      const response = await fetch('/api/admin/catalog/pricing', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.templateId,
          packageType,
          listPriceUsd: drafts[packageType].listPriceUsd,
          salePriceUsd: drafts[packageType].salePriceUsd || null,
          displayDiscountPercent: drafts[packageType].displayDiscountPercent || null,
          expectedVersion: source.version,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (saveIntentRef.current[packageType] !== intent) return
      if (!response.ok || !data?.packagePrice) {
        throw new Error(data?.error || 'Failed to update package price')
      }

      const nextPrice = data.packagePrice as BookPackagePrice
      setTemplates((current) => current.map((template) =>
        template.templateId === selectedTemplate.templateId
          ? {
              ...template,
              packagePricing: { ...template.packagePricing, [packageType]: nextPrice },
            }
          : template
      ))
      if (selectedTemplateIdRef.current === selectedTemplate.templateId) {
        setDrafts((current) => current ? { ...current, [packageType]: draftFromPrice(nextPrice) } : current)
        setSuccess(`${PACKAGE_META.find((item) => item.type === packageType)?.name} price updated.`)
      }
    } catch (saveError) {
      if (saveIntentRef.current[packageType] !== intent) return
      setError(saveError instanceof Error ? saveError.message : 'Failed to update package price')
    } finally {
      if (saveIntentRef.current[packageType] === intent) {
        setPendingPackages((current) => ({ ...current, [packageType]: false }))
      }
    }
  }

  const saveDisplayPackage = async (applyToAll: boolean) => {
    if (!selectedTemplate || displayPackagePending) return
    setDisplayPackagePending(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/catalog/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.templateId,
          catalogDisplayPackageType: displayPackageDraft,
          applyToAll,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !Array.isArray(data?.templateIds)) {
        throw new Error(data?.error || 'Failed to update public card package')
      }
      const updatedIds = new Set(data.templateIds.map(String))
      setTemplates((current) => current.map((template) => updatedIds.has(template.templateId)
        ? { ...template, catalogDisplayPackageType: displayPackageDraft }
        : template
      ))
      setSuccess(applyToAll
        ? `Public cards for all stories now show ${displayPackageDraft}.`
        : `${selectedTemplate.name} now shows ${displayPackageDraft} on public cards.`
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update public card package')
    } finally {
      setDisplayPackagePending(false)
    }
  }

  if (loading && !templates.length) {
    return (
      <AdminPanel className="flex min-h-64 items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-[var(--admin-accent)]" aria-label="Loading catalog pricing" />
      </AdminPanel>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}
      {success ? <AdminNotice tone="success">{success}</AdminNotice> : null}

      <div className="grid min-h-0 gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <AdminPanel className="min-h-0 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-page-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${adminFieldClass} mt-0 pl-9`}
              placeholder="Search stories"
              aria-label="Search stories"
            />
          </div>

          <div className="admin-review-scrollbar mt-3 max-h-[58dvh] space-y-1.5 overflow-y-auto pr-1 xl:max-h-[calc(100dvh-15rem)]">
            {filteredTemplates.map((template) => (
              <button
                key={template.templateId}
                type="button"
                disabled={hasPendingWrite}
                onClick={() => {
                  selectedTemplateIdRef.current = template.templateId
                  setSelectedTemplateId(template.templateId)
                  setDrafts(pricingDrafts(template))
                  setDisplayPackageDraft(template.catalogDisplayPackageType)
                  setError(null)
                  setSuccess(null)
                }}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                  selectedTemplateId === template.templateId
                    ? 'border-[var(--admin-accent)] bg-[color-mix(in_srgb,var(--admin-accent)_12%,transparent)]'
                    : 'border-transparent hover:border-[var(--admin-card-line)] hover:bg-[var(--admin-panel-2)]'
                }`}
              >
                <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--admin-panel-2)]">
                  {template.coverUrl ? (
                    <Image
                      src={template.coverUrl}
                      alt=""
                      width={36}
                      height={44}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOpen className="m-2.5 h-4 w-4 text-[var(--admin-page-muted)]" />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--admin-page-ink)]">{template.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--admin-page-muted)]">{template.templateId}</span>
                </span>
                <span className={`h-2 w-2 rounded-full ${template.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label={template.isActive ? 'Active' : 'Inactive'} />
              </button>
            ))}
            {!filteredTemplates.length ? <AdminEmptyState>No stories match this search.</AdminEmptyState> : null}
          </div>
        </AdminPanel>

        <AdminPanel className="min-w-0 p-4 sm:p-5">
          {selectedTemplate && drafts ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[var(--admin-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold text-[var(--admin-page-ink)]">{selectedTemplate.name}</h2>
                    <AdminStatusBadge tone={selectedTemplate.isActive ? 'success' : 'neutral'}>
                      {selectedTemplate.isActive ? 'Active' : 'Inactive'}
                    </AdminStatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--admin-page-muted)]">USD is the catalog source currency. Storefront currencies are converted at display and checkout.</p>
                </div>
                <AdminButton type="button" tone="quiet" onClick={() => void load()} disabled={loading || hasPendingWrite}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </AdminButton>
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-4 lg:flex-row lg:items-end lg:justify-between">
                <label className={`${adminLabelClass} min-w-0 lg:w-72`}>
                  Public card price package
                  <select
                    className={adminFieldClass}
                    value={displayPackageDraft}
                    disabled={displayPackagePending}
                    onChange={(event) => setDisplayPackageDraft(event.target.value as BookPackageType)}
                  >
                    {PACKAGE_META.map((item) => {
                      const lacksRequiredSale = selectedIsInDiscount
                        && selectedTemplate.packagePricing[item.type].salePriceUsd === null
                      return (
                        <option key={item.type} value={item.type} disabled={lacksRequiredSale}>
                          {item.name}{lacksRequiredSale ? ' - no sale for Home In Discount' : ''}
                        </option>
                      )
                    })}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <AdminButton
                    type="button"
                    tone="secondary"
                    disabled={displayPackagePending || selectedDisplayPackageBlocked || displayPackageDraft === selectedTemplate.catalogDisplayPackageType}
                    onClick={() => void saveDisplayPackage(false)}
                  >
                    {displayPackagePending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save for this story
                  </AdminButton>
                  <AdminButton type="button" tone="dark" disabled={displayPackagePending || applyAllDisplayPackageBlocked} onClick={() => void saveDisplayPackage(true)}>
                    Apply to all stories
                  </AdminButton>
                </div>
              </div>
              {selectedDisplayPackageBlocked || applyAllDisplayPackageBlocked ? (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  Home In Discount stories can only display a package that currently has a sale price.
                </p>
              ) : null}

              <div className="mt-5 grid gap-4 2xl:grid-cols-3">
                {PACKAGE_META.map((meta) => {
                  const source = selectedTemplate.packagePricing[meta.type]
                  const draft = drafts[meta.type]
                  const listPrice = Number(draft.listPriceUsd)
                  const salePrice = draft.salePriceUsd ? Number(draft.salePriceUsd) : null
                  const valid = Number.isFinite(listPrice) && listPrice > 0 && (salePrice === null || (Number.isFinite(salePrice) && salePrice > 0 && salePrice < listPrice))
                  const marketingDiscount = draft.displayDiscountPercent ? Number(draft.displayDiscountPercent) : null
                  const dirty = draft.listPriceUsd !== source.listPriceUsd.toFixed(2)
                    || draft.salePriceUsd !== (source.salePriceUsd?.toFixed(2) ?? '')
                    || draft.displayDiscountPercent !== (source.displayDiscountPercent?.toString() ?? '')
                  const effective = salePrice ?? listPrice
                  const computedDiscountPercent = salePrice && listPrice ? Math.round((1 - salePrice / listPrice) * 100) : null
                  const discountPercent = marketingDiscount ?? computedDiscountPercent
                  const validMarketingDiscount = marketingDiscount === null || (Number.isSafeInteger(marketingDiscount) && marketingDiscount >= 1 && marketingDiscount <= 99 && salePrice !== null)
                  const isPending = pendingPackages[meta.type]
                  const protectsHomeDiscount = selectedIsInDiscount && selectedTemplate.catalogDisplayPackageType === meta.type
                  const keepsHomeDiscountValid = !protectsHomeDiscount || salePrice !== null

                  return (
                    <section key={meta.type} className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-accent)]">{meta.type}</p>
                          <h3 className="mt-1 font-bold text-[var(--admin-page-ink)]">{meta.name}</h3>
                          <p className="mt-1 text-xs text-[var(--admin-page-muted)]">{meta.description}</p>
                        </div>
                        <Tag className="h-4 w-4 shrink-0 text-[var(--admin-page-muted)]" />
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-3 2xl:grid-cols-1">
                        <label className={adminLabelClass}>
                          List price (USD)
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            max="10000"
                            step="0.01"
                            value={draft.listPriceUsd}
                            onChange={(event) => updateDraft(meta.type, 'listPriceUsd', event.target.value)}
                            className={adminFieldClass}
                            disabled={isPending}
                          />
                        </label>
                        <label className={adminLabelClass}>
                          Marketing discount %
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="99"
                            step="1"
                            value={draft.displayDiscountPercent}
                            onChange={(event) => updateDraft(meta.type, 'displayDiscountPercent', event.target.value)}
                            className={adminFieldClass}
                            placeholder={computedDiscountPercent ? `Auto: ${computedDiscountPercent}%` : 'Auto'}
                            disabled={isPending || salePrice === null}
                          />
                        </label>
                        <label className={adminLabelClass}>
                          Sale price (optional)
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            max="10000"
                            step="0.01"
                            value={draft.salePriceUsd}
                            onChange={(event) => updateDraft(meta.type, 'salePriceUsd', event.target.value)}
                            className={adminFieldClass}
                            placeholder="No sale"
                            disabled={isPending}
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--admin-line)] pt-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">Customer price</p>
                          <p className="mt-1 text-xl font-bold text-[var(--admin-page-ink)]">{valid ? formatUsd(effective) : '--'}</p>
                          {discountPercent ? <p className="mt-0.5 text-xs font-semibold text-emerald-600">{discountPercent}% catalog discount</p> : null}
                        </div>
                        <AdminButton
                          type="button"
                          tone="primary"
                          onClick={() => void savePackage(meta.type)}
                          disabled={!dirty || !valid || !validMarketingDiscount || !keepsHomeDiscountValid || isPending}
                        >
                          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Save
                        </AdminButton>
                      </div>
                      {protectsHomeDiscount ? (
                        <p className="mt-3 text-xs text-amber-700">This package powers the story&apos;s Home In Discount card, so its sale price cannot be cleared.</p>
                      ) : null}
                    </section>
                  )
                })}
              </div>

              <AdminNotice tone="info" className="mt-5">
                Catalog sale prices are applied first. Promo codes and vouchers continue to apply afterward. Existing paid orders keep their stored purchase price.
              </AdminNotice>
            </>
          ) : (
            <AdminEmptyState>Select a story to manage package pricing.</AdminEmptyState>
          )}
        </AdminPanel>
      </div>

      <CatalogHomePlacementManager
        key={homeSections.map((section) => `${section.sectionKey}:${section.version}`).join('|')}
        templates={templates}
        sections={homeSections}
        onSectionSaved={(nextSection) => setHomeSections((current) => current.map((section) =>
          section.sectionKey === nextSection.sectionKey ? nextSection : section
        ))}
      />
    </div>
  )
}
