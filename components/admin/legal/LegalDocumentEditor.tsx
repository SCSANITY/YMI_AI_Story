'use client'

import { Eye, FilePenLine, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { LegalSection, LegalTextItem } from '@/lib/footer-legal-content'
import {
  getLegalPublishReadiness,
  type LegalDocumentState,
  type LegalRevisionContent,
} from '@/lib/legal-publishing'
import {
  ADMIN_FIELD_CLASS,
  ADMIN_SECONDARY_BUTTON_CLASS,
  LEGAL_DOCUMENT_LABELS,
} from './legalUi'
import { LegalDraftPreview } from './LegalDraftPreview'

type Props = {
  state: LegalDocumentState
  onCommitted: (state: LegalDocumentState) => void
  onReload: () => void
}

type ItemGroup = 'paragraphs' | 'bullets'

function cloneContent(content: LegalRevisionContent): LegalRevisionContent {
  return JSON.parse(JSON.stringify(content)) as LegalRevisionContent
}

function emptyItem(): LegalTextItem {
  return { text: '' }
}

function emptySection(): LegalSection {
  return { title: '', paragraphs: [emptyItem()] }
}

function ItemEditor({
  item,
  itemIndex,
  groupLabel,
  onChange,
  onRemove,
}: {
  item: LegalTextItem
  itemIndex: number
  groupLabel: string
  onChange: (field: keyof LegalTextItem, value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-slate-950/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {groupLabel} {itemIndex + 1}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label={`Remove ${groupLabel.toLowerCase()} ${itemIndex + 1}`}
          title="Remove item"
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-400">
          Label <span className="font-normal text-slate-600">(optional)</span>
          <input
            value={item.label ?? ''}
            onChange={(event) => onChange('label', event.target.value)}
            className={`${ADMIN_FIELD_CLASS} mt-1`}
            placeholder="Strict Purpose Limitation:"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-400">
          HTTPS link <span className="font-normal text-slate-600">(optional)</span>
          <input
            type="url"
            value={item.href ?? ''}
            onChange={(event) => onChange('href', event.target.value)}
            className={`${ADMIN_FIELD_CLASS} mt-1`}
            placeholder="https://..."
          />
        </label>
      </div>
      <label className="mt-2 block text-[11px] font-semibold text-slate-400">
        Text
        <textarea
          value={item.text}
          onChange={(event) => onChange('text', event.target.value)}
          className={`${ADMIN_FIELD_CLASS} mt-1 min-h-24 resize-y leading-6`}
          placeholder="Policy text"
        />
      </label>
    </div>
  )
}

export function LegalDocumentEditor({ state, onCommitted, onReload }: Props) {
  const sourceContent = (
    state.draft?.content ?? state.currentPublished?.content
  ) as LegalRevisionContent

  const [content, setContent] = useState<LegalRevisionContent>(() =>
    cloneContent(sourceContent),
  )
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [pendingAction, setPendingAction] = useState<'save' | 'publish' | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const requestIntentRef = useRef(0)

  const dirty = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(sourceContent),
    [content, sourceContent],
  )
  const publishReadiness = getLegalPublishReadiness(state)
  const label = LEGAL_DOCUMENT_LABELS[state.document.documentKey]

  const updateEnglish = (
    updater: (current: LegalRevisionContent['en']) => LegalRevisionContent['en'],
  ) => {
    setContent((current) => ({ en: updater(current.en) }))
    setSuccess(null)
    setConfirmPublish(false)
  }

  const updateSection = (
    sectionIndex: number,
    updater: (section: LegalSection) => LegalSection,
  ) => {
    updateEnglish((english) => ({
      ...english,
      sections: english.sections.map((section, index) =>
        index === sectionIndex ? updater(section) : section,
      ),
    }))
  }

  const updateItem = (
    sectionIndex: number,
    group: ItemGroup,
    itemIndex: number,
    field: keyof LegalTextItem,
    value: string,
  ) => {
    updateSection(sectionIndex, (section) => ({
      ...section,
      [group]: (section[group] ?? []).map((item, index) =>
        index === itemIndex ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const removeItem = (
    sectionIndex: number,
    group: ItemGroup,
    itemIndex: number,
  ) => {
    updateSection(sectionIndex, (section) => {
      const nextItems = (section[group] ?? []).filter((_, index) => index !== itemIndex)
      const next = { ...section }
      if (nextItems.length > 0) next[group] = nextItems
      else delete next[group]
      return next
    })
  }

  const addItem = (sectionIndex: number, group: ItemGroup) => {
    updateSection(sectionIndex, (section) => ({
      ...section,
      [group]: [...(section[group] ?? []), emptyItem()],
    }))
  }

  const saveDraft = async () => {
    const baseRevisionId = state.document.currentPublishedRevisionId
    if (!baseRevisionId || pendingAction) return
    const requestIntent = ++requestIntentRef.current
    setPendingAction('save')
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(
        `/api/admin/legal-documents/${state.document.documentKey}`,
        {
          method: 'PUT',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            expectedDraftRevisionId: state.draft?.revisionId ?? null,
            expectedDraftVersion: state.draft?.draftVersion ?? null,
            basePublishedRevisionId: baseRevisionId,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (requestIntentRef.current !== requestIntent) return
      if (!response.ok || !data?.document) {
        throw new Error(data?.error || 'Draft save failed')
      }
      setSuccess('Draft saved. Public policy text is unchanged.')
      onCommitted(data.document as LegalDocumentState)
    } catch (saveError) {
      if (requestIntentRef.current !== requestIntent) return
      setError(saveError instanceof Error ? saveError.message : 'Draft save failed')
    } finally {
      if (requestIntentRef.current === requestIntent) setPendingAction(null)
    }
  }

  const publishDraft = async () => {
    const draft = state.draft
    const baseRevisionId = state.document.currentPublishedRevisionId
    if (!draft || !baseRevisionId || dirty || pendingAction) return
    const requestIntent = ++requestIntentRef.current
    setPendingAction('publish')
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(
        `/api/admin/legal-documents/${state.document.documentKey}/publish`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftRevisionId: draft.revisionId,
            expectedDraftVersion: draft.draftVersion,
            basePublishedRevisionId: baseRevisionId,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (requestIntentRef.current !== requestIntent) return
      if (!response.ok || !data?.document) {
        throw new Error(data?.error || 'Publish failed')
      }
      setConfirmPublish(false)
      setSuccess('Published as a new immutable revision.')
      onCommitted(data.document as LegalDocumentState)
    } catch (publishError) {
      if (requestIntentRef.current !== requestIntent) return
      setError(publishError instanceof Error ? publishError.message : 'Publish failed')
    } finally {
      if (requestIntentRef.current === requestIntent) setPendingAction(null)
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-slate-950/55">
      <header className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              English · Atomic revision
            </p>
            <h2 className="mt-1 truncate text-xl font-bold text-white">{label.title}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {state.draft
                ? `Draft revision ${state.draft.revisionNumber} · save ${state.draft.draftVersion}`
                : `Editing from live revision ${state.currentPublished?.revisionNumber}`}
            </p>
          </div>
          <div className="flex shrink-0 rounded-md border border-white/10 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-semibold ${
                mode === 'edit' ? 'bg-white/10 text-white' : 'text-slate-400'
              }`}
            >
              <FilePenLine aria-hidden="true" className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-semibold ${
                mode === 'preview' ? 'bg-white/10 text-white' : 'text-slate-400'
              }`}
            >
              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-5">
        {error ? (
          <div role="alert" className="mb-4 flex flex-col gap-3 rounded-md border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={onReload}
              className={ADMIN_SECONDARY_BUTTON_CLASS}
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              Reload server state
            </button>
          </div>
        ) : null}
        {success ? (
          <p role="status" className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
            {success}
          </p>
        ) : null}

        {mode === 'preview' ? (
          <LegalDraftPreview content={content} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-400">
                Effective date
                <input
                  type="date"
                  value={content.en.effectiveDate}
                  onChange={(event) =>
                    updateEnglish((english) => ({
                      ...english,
                      effectiveDate: event.target.value,
                    }))
                  }
                  className={`${ADMIN_FIELD_CLASS} mt-1.5`}
                />
              </label>
              <label className="text-xs font-semibold text-slate-400">
                Version label
                <input
                  value={content.en.version}
                  onChange={(event) =>
                    updateEnglish((english) => ({
                      ...english,
                      version: event.target.value,
                    }))
                  }
                  className={`${ADMIN_FIELD_CLASS} mt-1.5`}
                  placeholder="2026-07-28"
                />
              </label>
            </div>

            {content.en.sections.map((section, sectionIndex) => (
              <article
                key={sectionIndex}
                className="rounded-lg border border-white/10 bg-white/[0.025] p-3 sm:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">
                    Section {sectionIndex + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateEnglish((english) => ({
                        ...english,
                        sections: english.sections.filter((_, index) => index !== sectionIndex),
                      }))
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    aria-label={`Remove section ${sectionIndex + 1}`}
                    title="Remove section"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-3 block text-[11px] font-semibold text-slate-400">
                  Section title <span className="font-normal text-slate-600">(optional)</span>
                  <input
                    value={section.title ?? ''}
                    onChange={(event) =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={`${ADMIN_FIELD_CLASS} mt-1`}
                    placeholder="1. Data We Collect"
                  />
                </label>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Paragraphs
                    </p>
                    <button
                      type="button"
                      onClick={() => addItem(sectionIndex, 'paragraphs')}
                      className={ADMIN_SECONDARY_BUTTON_CLASS}
                    >
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                      Paragraph
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(section.paragraphs ?? []).map((item, itemIndex) => (
                      <ItemEditor
                        key={itemIndex}
                        item={item}
                        itemIndex={itemIndex}
                        groupLabel="Paragraph"
                        onChange={(field, value) =>
                          updateItem(
                            sectionIndex,
                            'paragraphs',
                            itemIndex,
                            field,
                            value,
                          )
                        }
                        onRemove={() =>
                          removeItem(sectionIndex, 'paragraphs', itemIndex)
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Bullets
                    </p>
                    <button
                      type="button"
                      onClick={() => addItem(sectionIndex, 'bullets')}
                      className={ADMIN_SECONDARY_BUTTON_CLASS}
                    >
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                      Bullet
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(section.bullets ?? []).map((item, itemIndex) => (
                      <ItemEditor
                        key={itemIndex}
                        item={item}
                        itemIndex={itemIndex}
                        groupLabel="Bullet"
                        onChange={(field, value) =>
                          updateItem(sectionIndex, 'bullets', itemIndex, field, value)
                        }
                        onRemove={() => removeItem(sectionIndex, 'bullets', itemIndex)}
                      />
                    ))}
                  </div>
                </div>
              </article>
            ))}

            <button
              type="button"
              onClick={() =>
                updateEnglish((english) => ({
                  ...english,
                  sections: [...english.sections, emptySection()],
                }))
              }
              className={`${ADMIN_SECONDARY_BUTTON_CLASS} w-full border-dashed`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add section
            </button>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-white/10 bg-slate-950/95 p-4 backdrop-blur-xl sm:p-5">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <p className="text-xs font-semibold text-white">
              {dirty ? 'Unsaved draft changes' : state.draft ? 'Draft saved' : 'Live copy loaded'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Draft saves never alter customer-facing policy text.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!dirty || Boolean(pendingAction)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {pendingAction === 'save' ? 'Saving...' : 'Save Draft'}
            </button>
            {!confirmPublish ? (
              <button
                type="button"
                onClick={() => setConfirmPublish(true)}
                disabled={
                  dirty ||
                  !state.draft ||
                  !publishReadiness.ready ||
                  Boolean(pendingAction)
                }
                title={
                  publishReadiness.ready
                    ? 'Publish saved draft'
                    : publishReadiness.reason
                }
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-xs font-black text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                Publish Draft
              </button>
            ) : (
              <div className="flex gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.08] p-1.5">
                <button
                  type="button"
                  onClick={() => void publishDraft()}
                  disabled={Boolean(pendingAction)}
                  className="min-h-9 rounded bg-amber-300 px-3 text-xs font-black text-slate-950 disabled:opacity-50"
                >
                  {pendingAction === 'publish' ? 'Publishing...' : 'Confirm Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPublish(false)}
                  disabled={Boolean(pendingAction)}
                  className={ADMIN_SECONDARY_BUTTON_CLASS}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </section>
  )
}
