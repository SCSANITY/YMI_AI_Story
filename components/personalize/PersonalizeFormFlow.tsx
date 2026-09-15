'use client'

import { memo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Pencil, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/Button'
import { ChildDetailsFields, type RecentProfileItem } from '@/components/personalize/ChildDetailsFields'
import { GeneratePreviewAction, type GeneratePreviewConsent } from '@/components/personalize/GeneratePreviewAction'
import { PhotoUploadPanel } from '@/components/personalize/PhotoUploadPanel'
import { PrivacyReassurance } from '@/components/personalize/PrivacyReassurance'
import { RecentFacesStrip, type RecentFaceItem } from '@/components/personalize/RecentFacesStrip'
import { StoryLanguageSelector } from '@/components/personalize/StoryLanguageSelector'
import type { StoryLanguage } from '@/types'

export type PersonalizeFormStep = 'INTRO' | 'PHOTO' | 'DETAILS' | 'REVIEW'

type FacePrepareStatus = 'idle' | 'checking' | 'preparing' | 'ready' | 'failed'

type PersonalizeFormFlowProps = {
  step: Exclude<PersonalizeFormStep, 'INTRO'>
  photoPreview: string | null
  hasUsablePhoto: boolean
  facePrepareStatus: FacePrepareStatus
  facePrepareError: string | null
  faceAutoCropped?: boolean
  photoLabels: {
    uploadChildPhoto: string
    photoChecking: string
    photoPreparing: string
    photoReady: string
    photoAutoCentered: string
    photoPrepareFailed: string
    photoQualityReason: string
    clickToChangePhoto: string
    uploadPhotoHint: string
    photoTips: string
  }
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  recentFaces: RecentFaceItem[]
  onSelectFace: (face: RecentFaceItem) => void
  onDeleteFace: (assetId: string) => void
  initialName: string
  initialAge: string
  recentProfiles: RecentProfileItem[]
  childLabels: {
    nameLabel: string
    namePlaceholder: string
    ageLabel: string
    agePlaceholder: string
    noHistory: string
  }
  ageRangeWarning?: string | null
  minimumRecommendedAge?: number
  onLoadProfiles: () => void
  onChildDetailsChange: (details: { name: string; age: string }) => void
  onDeleteProfileValue: (payload: { field: 'name' | 'age'; value: string | number }) => void
  selectedLang: StoryLanguage
  languageLabels: {
    field: string
    english: string
    simplifiedChinese: string
    traditionalChinese: string
    comingSoon: string
  }
  onLanguageChange: (value: StoryLanguage) => void
  isDetailsReady: boolean
  isFormReady: boolean
  isFacePreparing: boolean
  isPhotoFailed: boolean
  previewError: string | null
  labels: {
    photoTitle: string
    photoBody: string
    detailsTitle: string
    detailsBody: string
    reviewTitle: string
    reviewBody: string
    stepLabel: (current: number) => string
    continue: string
    reviewDetails: string
    back: string
    edit: string
    photoSummary: string
    detailsSummary: string
    languageSummary: string
    acknowledgement: string
    privacyPolicy: string
    required: string
    photoPreparing: string
    photoNeedsFix: string
    dataConsentRequiredShort: string
    generateMagicPreview: string
    completeDetails: string
  }
  onStepChange: (step: PersonalizeFormStep) => void
  onGenerate: (consent: GeneratePreviewConsent) => void
}

const STEP_META = { PHOTO: 1, DETAILS: 2, REVIEW: 3 } as const

type ReviewEditField = 'name' | 'age' | 'language' | null

function ReviewInlineField({
  id,
  label,
  value,
  type,
  isEditing,
  editLabel,
  className = '',
  onStartEdit,
  onFinishEdit,
  onChange,
}: {
  id: string
  label: string
  value: string
  type: 'text' | 'number'
  isEditing: boolean
  editLabel: string
  className?: string
  onStartEdit: () => void
  onFinishEdit: () => void
  onChange: (value: string) => void
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
        <button
          type="button"
          aria-controls={id}
          aria-expanded={isEditing}
          aria-label={`${editLabel} ${label}`}
          onMouseDown={(event) => {
            if (isEditing) event.preventDefault()
          }}
          onClick={isEditing ? onFinishEdit : onStartEdit}
          className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {isEditing ? <Check className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <dd className="mt-1 min-h-9">
        {isEditing ? (
          <input
            id={id}
            type={type}
            min={type === 'number' ? 0 : undefined}
            inputMode={type === 'number' ? 'decimal' : undefined}
            value={value}
            autoFocus
            onChange={(event) => onChange(event.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            className="h-9 w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 text-sm font-semibold text-slate-950 outline-none transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        ) : (
          <span id={id} className="block break-words pt-1 text-sm font-semibold text-slate-900">
            {value.trim() || '—'}
          </span>
        )}
      </dd>
    </div>
  )
}

function StepHeader({ current, title, body, stepLabel }: { current: number; title: string; body: string; stepLabel: string }) {
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{stepLabel}</span>
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span key={step} className={`h-1.5 w-8 rounded-full ${step <= current ? 'bg-amber-500' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>
      <h1 className="mt-3 font-serif text-[1.65rem] font-bold leading-tight tracking-[-0.02em] text-slate-950 sm:text-[1.75rem]">{title}</h1>
      <p className="mt-1.5 text-[13px] leading-5 text-slate-600 sm:text-sm">{body}</p>
    </header>
  )
}

function PersonalizeFormFlowComponent(props: PersonalizeFormFlowProps) {
  const [reviewEditField, setReviewEditField] = useState<ReviewEditField>(null)
  const stepNumber = STEP_META[props.step]
  const title = props.step === 'PHOTO' ? props.labels.photoTitle : props.step === 'DETAILS' ? props.labels.detailsTitle : props.labels.reviewTitle
  const body = props.step === 'PHOTO' ? props.labels.photoBody : props.step === 'DETAILS' ? props.labels.detailsBody : props.labels.reviewBody
  const reviewPhotoStatus = props.facePrepareStatus === 'checking'
    ? props.photoLabels.photoChecking
    : props.facePrepareStatus === 'preparing'
      ? props.photoLabels.photoPreparing
      : props.facePrepareStatus === 'failed'
        ? props.facePrepareError ?? props.photoLabels.photoPrepareFailed
        : props.photoLabels.photoReady

  return (
    <section className="rounded-[1.5rem] bg-white p-4 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.48)] sm:p-5 lg:p-6">
      <StepHeader current={stepNumber} title={title} body={body} stepLabel={props.labels.stepLabel(stepNumber)} />

      <div className="mt-4">
        {props.step === 'PHOTO' ? (
          <div className="flex flex-col gap-3">
            <PhotoUploadPanel
              photoPreview={props.photoPreview}
              facePrepareStatus={props.facePrepareStatus}
              facePrepareError={props.facePrepareError}
              faceAutoCropped={props.faceAutoCropped}
              labels={props.photoLabels}
              onPhotoUpload={props.onPhotoUpload}
            />
            <PrivacyReassurance />
            <RecentFacesStrip faces={props.recentFaces} onSelectFace={props.onSelectFace} onDeleteFace={props.onDeleteFace} />
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => props.onStepChange('INTRO')}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                {props.labels.back}
              </Button>
              <Button type="button" disabled={!props.hasUsablePhoto} onClick={() => props.onStepChange('DETAILS')} className="glass-action-btn glass-action-btn--brand h-11 rounded-xl px-6">
                {props.labels.continue}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {props.step === 'DETAILS' ? (
          <div className="flex flex-col gap-4">
            <ChildDetailsFields
              initialName={props.initialName}
              initialAge={props.initialAge}
              recentProfiles={props.recentProfiles}
              labels={props.childLabels}
              ageRangeWarning={props.ageRangeWarning}
              minimumRecommendedAge={props.minimumRecommendedAge}
              onLoadProfiles={props.onLoadProfiles}
              onChange={props.onChildDetailsChange}
              onDeleteProfileValue={props.onDeleteProfileValue}
            />
            <StoryLanguageSelector value={props.selectedLang} labels={props.languageLabels} onChange={props.onLanguageChange} />
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => props.onStepChange('PHOTO')}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                {props.labels.back}
              </Button>
              <Button type="button" disabled={!props.isDetailsReady} onClick={() => props.onStepChange('REVIEW')} className="glass-action-btn glass-action-btn--brand h-11 rounded-xl px-6">
                {props.labels.reviewDetails}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {props.step === 'REVIEW' ? (
          <div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 border-b border-slate-200 p-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-amber-50">
                  {props.photoPreview ? (
                    // Blob and signed Preview URLs are runtime values, so a native image is intentional here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={props.photoPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Sparkles className="m-4 h-6 w-6 text-amber-600" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{props.labels.photoSummary}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {props.isFacePreparing ? (
                      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden="true" />
                    ) : props.isPhotoFailed ? (
                      <TriangleAlert className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    )}
                    <span className={props.isPhotoFailed ? 'text-rose-600' : undefined}>{reviewPhotoStatus}</span>
                  </p>
                </div>
                <label className={`relative rounded-full p-2 text-slate-500 transition-colors focus-within:ring-2 focus-within:ring-amber-500 ${props.isFacePreparing ? 'cursor-wait opacity-50' : 'cursor-pointer hover:bg-slate-100 hover:text-slate-950'}`} aria-label={`${props.labels.edit} ${props.labels.photoSummary}`}>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={props.isFacePreparing}
                    onChange={props.onPhotoUpload}
                    className="sr-only"
                  />
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </label>
              </div>
              <div className="border-b border-slate-200 p-3">
                <dl
                  className="grid min-w-0 flex-1 grid-cols-2 gap-x-5"
                  aria-label={props.labels.detailsSummary}
                >
                  <ReviewInlineField
                    id="review-child-name"
                    label={props.childLabels.nameLabel}
                    value={props.initialName}
                    type="text"
                    isEditing={reviewEditField === 'name'}
                    editLabel={props.labels.edit}
                    onStartEdit={() => setReviewEditField('name')}
                    onFinishEdit={() => setReviewEditField(null)}
                    onChange={(name) => props.onChildDetailsChange({ name, age: props.initialAge })}
                  />
                  <ReviewInlineField
                    id="review-child-age"
                    label={props.childLabels.ageLabel}
                    value={props.initialAge}
                    type="number"
                    isEditing={reviewEditField === 'age'}
                    editLabel={props.labels.edit}
                    className="border-l border-slate-200 pl-5"
                    onStartEdit={() => setReviewEditField('age')}
                    onFinishEdit={() => setReviewEditField(null)}
                    onChange={(age) => props.onChildDetailsChange({ name: props.initialName, age })}
                  />
                </dl>
              </div>
              <div className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  {reviewEditField === 'language' ? (
                    <StoryLanguageSelector value={props.selectedLang} labels={props.languageLabels} onChange={props.onLanguageChange} />
                  ) : (
                    <>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{props.labels.languageSummary}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{props.selectedLang}</p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  aria-expanded={reviewEditField === 'language'}
                  onMouseDown={(event) => {
                    if (reviewEditField === 'language') event.preventDefault()
                  }}
                  onClick={() => setReviewEditField((field) => field === 'language' ? null : 'language')}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  aria-label={`${props.labels.edit} ${props.labels.languageSummary}`}
                >
                  {reviewEditField === 'language' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <GeneratePreviewAction
              isFormReady={props.isFormReady}
              isFacePreparing={props.isFacePreparing}
              isPhotoFailed={props.isPhotoFailed}
              previewError={props.previewError}
              labels={{
                acknowledgement: props.labels.acknowledgement,
                privacyPolicy: props.labels.privacyPolicy,
                required: props.labels.required,
                photoPreparing: props.labels.photoPreparing,
                photoNeedsFix: props.labels.photoNeedsFix,
                dataConsentRequiredShort: props.labels.dataConsentRequiredShort,
                generateMagicPreview: props.labels.generateMagicPreview,
                completeDetails: props.labels.completeDetails,
              }}
              onGenerate={props.onGenerate}
            />
            <Button type="button" variant="ghost" onClick={() => props.onStepChange('DETAILS')} className="mt-3">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {props.labels.back}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export const PersonalizeFormFlow = memo(PersonalizeFormFlowComponent)
