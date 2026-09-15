'use client'

import { memo } from 'react'
import { ArrowLeft, ArrowRight, Check, Pencil, Sparkles } from 'lucide-react'
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
  childDetailsSeedVersion: number
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
  const stepNumber = STEP_META[props.step]
  const title = props.step === 'PHOTO' ? props.labels.photoTitle : props.step === 'DETAILS' ? props.labels.detailsTitle : props.labels.reviewTitle
  const body = props.step === 'PHOTO' ? props.labels.photoBody : props.step === 'DETAILS' ? props.labels.detailsBody : props.labels.reviewBody

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
              seedVersion={props.childDetailsSeedVersion}
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
                    <Check className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    {props.photoLabels.photoReady}
                  </p>
                </div>
                <button type="button" onClick={() => props.onStepChange('PHOTO')} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`${props.labels.edit} ${props.labels.photoSummary}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-start gap-3 border-b border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{props.labels.detailsSummary}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{props.initialName} · {props.initialAge}</p>
                </div>
                <button type="button" onClick={() => props.onStepChange('DETAILS')} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`${props.labels.edit} ${props.labels.detailsSummary}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{props.labels.languageSummary}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{props.selectedLang}</p>
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
