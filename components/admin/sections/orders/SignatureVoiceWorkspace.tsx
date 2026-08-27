'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  Headphones,
  Loader2,
  Music2,
  PackageCheck,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { AdminFloatingDialog } from '@/components/admin/AdminFloatingDialog'
import {
  AdminButton,
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
  type AdminStatusTone,
} from '@/components/admin/AdminUi'
import { supabase } from '@/lib/supabase'
import {
  resolveSignatureVoiceFileContentType,
  type AdminSignatureVoiceNarrationSlot,
  type AdminSignatureVoiceItem,
  type AdminSignatureVoiceWorkspace as Workspace,
  type SignatureVoiceTriageStatus,
} from '@/lib/signature-voice-admin'
import { SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS } from '@/lib/signature-voice'

const TRIAGE_OPTIONS: Array<[SignatureVoiceTriageStatus, string]> = [
  ['pending', 'Pending'],
  ['accepted', 'Accepted'],
  ['rejected', 'Rerecord required'],
]

const RELATIONSHIP_LABELS: Record<(typeof SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS)[number], string> = {
  self: 'Self',
  parent_or_guardian: 'Parent or guardian',
  family_member: 'Family member',
  other_authorized_adult: 'Other authorized adult',
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return '-'
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTimestamp(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function triageTone(status: SignatureVoiceTriageStatus): AdminStatusTone {
  if (status === 'accepted') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

function TriageEditor({
  orderId,
  item,
  onWorkspace,
}: {
  orderId: string
  item: AdminSignatureVoiceItem
  onWorkspace: (workspace: Workspace) => void
}) {
  const [technicalStatus, setTechnicalStatus] = useState(item.triage.technicalStatus)
  const [technicalReason, setTechnicalReason] = useState(item.triage.technicalReason || '')
  const [adultStatus, setAdultStatus] = useState(item.triage.adultDeclarationStatus)
  const [adultReason, setAdultReason] = useState(item.triage.adultDeclarationReason || '')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    setTechnicalStatus(item.triage.technicalStatus)
    setTechnicalReason(item.triage.technicalReason || '')
    setAdultStatus(item.triage.adultDeclarationStatus)
    setAdultReason(item.triage.adultDeclarationReason || '')
    setFeedback(null)
  }, [item])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/signature-voice`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: item.cartItemId,
          creationId: item.creationId,
          expectedUpdatedAt: item.triage.updatedAt,
          technicalStatus,
          technicalReason,
          adultDeclarationStatus: adultStatus,
          adultDeclarationReason: adultReason,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.workspace) {
        throw new Error(data?.error || 'Failed to save Signature Voice source review')
      }
      onWorkspace(data.workspace as Workspace)
      setFeedback({ tone: 'success', text: 'Source review saved.' })
    } catch (error) {
      setFeedback({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to save Signature Voice source review',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_72%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_48%,transparent)] p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[var(--admin-accent-dp)]" />
        <h4 className="text-sm font-bold text-[var(--admin-page-ink)]">Source review</h4>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <label className={adminLabelClass}>
            Technical usability
            <select
              className={adminFieldClass}
              value={technicalStatus}
              onChange={(event) => setTechnicalStatus(event.target.value as SignatureVoiceTriageStatus)}
            >
              {TRIAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {technicalStatus === 'rejected' ? (
            <label className={`${adminLabelClass} mt-3`}>
              Rerecord reason
              <textarea
                className={`${adminFieldClass} min-h-20 py-2`}
                value={technicalReason}
                maxLength={1000}
                onChange={(event) => setTechnicalReason(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div>
          <label className={adminLabelClass}>
            Authorization review
            <select
              className={adminFieldClass}
              value={adultStatus}
              onChange={(event) => setAdultStatus(event.target.value as SignatureVoiceTriageStatus)}
            >
              {TRIAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {adultStatus === 'rejected' ? (
            <label className={`${adminLabelClass} mt-3`}>
              Authorization issue
              <textarea
                className={`${adminFieldClass} min-h-20 py-2`}
                value={adultReason}
                maxLength={1000}
                onChange={(event) => setAdultReason(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {feedback ? (
          <AdminNotice tone={feedback.tone} className="min-w-0 flex-1 py-2">
            {feedback.text}
          </AdminNotice>
        ) : null}
        <AdminButton type="button" tone="primary" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save review'}
        </AdminButton>
      </div>
    </div>
  )
}

function ReplacementUploader({
  orderId,
  item,
  onWorkspace,
}: {
  orderId: string
  item: AdminSignatureVoiceItem
  onWorkspace: (workspace: Workspace) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reason, setReason] = useState('')
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [subjectName, setSubjectName] = useState(item.declaration.subjectName)
  const [subjectRelationship, setSubjectRelationship] = useState(item.declaration.subjectRelationship)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    setFile(null)
    setReason('')
    setAuthorizationReference('')
    setSubjectName(item.declaration.subjectName)
    setSubjectRelationship(item.declaration.subjectRelationship)
    setFeedback(null)
  }, [item.source.assetId, item.declaration.subjectName, item.declaration.subjectRelationship])

  const selectFile = (nextFile: File | null) => {
    setFeedback(null)
    if (!nextFile) {
      setFile(null)
      return
    }
    const contentType = resolveSignatureVoiceFileContentType({
      fileName: nextFile.name,
      contentType: nextFile.type,
    })
    if (!contentType) {
      setFeedback({ tone: 'danger', text: 'Use WebM, M4A, MP3, MP4, WAV, or OGG audio.' })
      return
    }
    if (nextFile.size <= 0 || nextFile.size > 15 * 1024 * 1024) {
      setFeedback({ tone: 'danger', text: 'Recording must be no larger than 15 MB.' })
      return
    }
    setFile(nextFile)
  }

  const upload = async () => {
    if (!file || uploading) return
    const contentType = resolveSignatureVoiceFileContentType({
      fileName: file.name,
      contentType: file.type,
    })
    setUploading(true)
    setFeedback(null)
    try {
      const base = `/api/admin/orders/${encodeURIComponent(orderId)}/signature-voice/${encodeURIComponent(item.creationId)}/replacement`
      const uploadResponse = await fetch(`${base}/upload-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: item.cartItemId,
          expectedAssetId: item.source.assetId,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      })
      const spec = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok) throw new Error(spec?.error || 'Failed to prepare replacement upload')

      const { error: uploadError } = await supabase.storage
        .from(spec.bucket)
        .uploadToSignedUrl(spec.storagePath, spec.token, file, { contentType })
      if (uploadError) throw new Error(uploadError.message)

      const confirmResponse = await fetch(`${base}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: item.cartItemId,
          expectedAssetId: item.source.assetId,
          newAssetId: spec.newAssetId,
          storagePath: spec.storagePath,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          reason,
          authorizationReference,
          subjectName,
          subjectRelationship,
        }),
      })
      const confirmed = await confirmResponse.json().catch(() => ({}))
      if (!confirmResponse.ok || !confirmed?.workspace) {
        throw new Error(confirmed?.error || 'Failed to replace Signature Voice source')
      }
      onWorkspace(confirmed.workspace as Workspace)
      setFeedback({ tone: 'success', text: 'Source replaced. Triage was reset.' })
    } catch (error) {
      setFeedback({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to replace Signature Voice source',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <details className="rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_72%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_48%,transparent)] p-4">
      <summary className="cursor-pointer text-sm font-bold text-[var(--admin-page-ink)]">Replace source recording</summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <button
          type="button"
          className={`flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition ${
            dragging
              ? 'border-[var(--admin-accent-dp)] bg-[color-mix(in_srgb,var(--admin-accent)_14%,transparent)]'
              : 'border-[var(--admin-card-line)] bg-[color-mix(in_srgb,var(--admin-card)_38%,transparent)] hover:border-[var(--admin-accent-dp)]'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            selectFile(event.dataTransfer.files[0] || null)
          }}
        >
          <UploadCloud className="h-6 w-6 text-[var(--admin-accent-dp)]" />
          <span className="mt-2 text-sm font-bold text-[var(--admin-page-ink)]">
            {file?.name || 'Drop or select audio'}
          </span>
          <span className="mt-1 text-xs text-[var(--admin-page-muted)]">
            {file ? formatBytes(file.size) : '10-20 seconds, up to 15 MB'}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/x-m4a,.m4a,.mp3,.wav,.ogg,.webm"
          onChange={(event) => selectFile(event.target.files?.[0] || null)}
        />

        <div className="grid gap-3">
          <label className={adminLabelClass}>
            Replacement reason
            <textarea
              className={`${adminFieldClass} min-h-20 py-2`}
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className={adminLabelClass}>
            Authorization reference
            <input
              className={adminFieldClass}
              value={authorizationReference}
              maxLength={500}
              onChange={(event) => setAuthorizationReference(event.target.value)}
              placeholder="Support ticket or written approval"
            />
          </label>
        </div>
        <label className={adminLabelClass}>
          Voice subject
          <input
            className={adminFieldClass}
            value={subjectName}
            maxLength={120}
            onChange={(event) => setSubjectName(event.target.value)}
          />
        </label>
        <label className={adminLabelClass}>
          Relationship
          <select
            className={adminFieldClass}
            value={subjectRelationship}
            onChange={(event) => setSubjectRelationship(
              event.target.value as (typeof SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS)[number]
            )}
          >
            {SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS.map((value) => (
              <option key={value} value={value}>{RELATIONSHIP_LABELS[value]}</option>
            ))}
          </select>
        </label>
      </div>
      {feedback ? <AdminNotice tone={feedback.tone} className="mt-3">{feedback.text}</AdminNotice> : null}
      <div className="mt-3 flex justify-end">
        <AdminButton
          type="button"
          tone="danger"
          disabled={uploading || !file || !reason.trim() || !authorizationReference.trim() || !subjectName.trim()}
          onClick={() => void upload()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? 'Verifying...' : 'Replace source'}
        </AdminButton>
      </div>
    </details>
  )
}

function NarrationSlotEditor({
  orderId,
  item,
  slot,
  onWorkspace,
}: {
  orderId: string
  item: AdminSignatureVoiceItem
  slot: AdminSignatureVoiceNarrationSlot
  onWorkspace: (workspace: Workspace) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    setFile(null)
    setFeedback(null)
  }, [item.source.assetId, slot.track?.assetId])

  const selectFile = (nextFile: File | null) => {
    setFeedback(null)
    if (!nextFile) {
      setFile(null)
      return
    }
    const contentType = resolveSignatureVoiceFileContentType({
      fileName: nextFile.name,
      contentType: nextFile.type,
    })
    if (!contentType) {
      setFeedback({ tone: 'danger', text: 'Use WebM, M4A, MP3, MP4, WAV, or OGG audio.' })
      return
    }
    if (nextFile.size <= 0 || nextFile.size > 15 * 1024 * 1024) {
      setFeedback({ tone: 'danger', text: 'Narration must be no larger than 15 MB.' })
      return
    }
    setFile(nextFile)
  }

  const upload = async () => {
    if (!file || uploading) return
    const contentType = resolveSignatureVoiceFileContentType({
      fileName: file.name,
      contentType: file.type,
    })
    const base = `/api/admin/orders/${encodeURIComponent(orderId)}/signature-voice/${encodeURIComponent(item.creationId)}/narration/${encodeURIComponent(slot.slotKey)}`
    setUploading(true)
    setFeedback(null)
    try {
      const uploadResponse = await fetch(`${base}/upload-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: item.cartItemId,
          sourceAssetId: item.source.assetId,
          expectedTrackAssetId: slot.track?.assetId ?? null,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      })
      const spec = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok) throw new Error(spec?.error || 'Failed to prepare narration upload')

      const { error: uploadError } = await supabase.storage
        .from(spec.bucket)
        .uploadToSignedUrl(spec.storagePath, spec.token, file, { contentType })
      if (uploadError) throw new Error(uploadError.message)

      const confirmResponse = await fetch(`${base}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: item.cartItemId,
          sourceAssetId: item.source.assetId,
          expectedTrackAssetId: slot.track?.assetId ?? null,
          newAssetId: spec.newAssetId,
          storagePath: spec.storagePath,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      })
      const confirmed = await confirmResponse.json().catch(() => ({}))
      if (!confirmResponse.ok || !confirmed?.workspace) {
        throw new Error(confirmed?.error || 'Failed to archive narration')
      }
      onWorkspace(confirmed.workspace as Workspace)
      setFeedback({ tone: 'success', text: `Spread ${slot.position} verified.` })
    } catch (error) {
      setFeedback({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to archive narration',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <article
      className={`rounded-xl border p-3 transition ${
        dragging
          ? 'border-[var(--admin-accent-dp)] bg-[color-mix(in_srgb,var(--admin-accent)_12%,transparent)]'
          : 'border-[color-mix(in_srgb,var(--admin-card-line)_76%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_52%,transparent)]'
      }`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        selectFile(event.dataTransfer.files[0] || null)
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_14%,transparent)] text-[var(--admin-accent-dp)]">
            <Music2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--admin-page-ink)]">Spread {String(slot.position).padStart(2, '0')}</p>
            <p className="truncate text-xs text-[var(--admin-page-muted)]">
              {slot.track
                ? `${slot.track.durationSeconds.toFixed(1)} sec / ${formatBytes(slot.track.sizeBytes)} / r${slot.track.revision}`
                : 'Awaiting narration'}
            </p>
          </div>
        </div>
        {slot.track ? (
          <AdminStatusBadge tone="success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified
          </AdminStatusBadge>
        ) : (
          <AdminStatusBadge tone="warning">Empty</AdminStatusBadge>
        )}
      </div>

      {slot.track ? (
        <div className="mt-3">
          <audio
            key={slot.track.assetId}
            controls
            preload="metadata"
            src={slot.track.playbackUrl}
            className="w-full"
          />
          <a
            href={slot.track.downloadUrl}
            className="admin-v2-button admin-v2-button--secondary mt-2 w-full justify-center"
            download
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      ) : null}

      <button
        type="button"
        className="mt-3 flex min-h-16 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--admin-card-line)] px-3 py-2 text-center hover:border-[var(--admin-accent-dp)]"
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="h-4 w-4 text-[var(--admin-accent-dp)]" />
        <span className="mt-1 max-w-full truncate text-xs font-semibold text-[var(--admin-page-ink)]">
          {file?.name || (slot.track ? 'Select replacement' : 'Drop or select audio')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/x-m4a,.m4a,.mp3,.wav,.ogg,.webm"
        onChange={(event) => selectFile(event.target.files?.[0] || null)}
      />
      {feedback ? <AdminNotice tone={feedback.tone} className="mt-2">{feedback.text}</AdminNotice> : null}
      {file ? (
        <AdminButton
          type="button"
          tone="primary"
          className="mt-2 w-full justify-center"
          disabled={uploading}
          onClick={() => void upload()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? 'Verifying...' : slot.track ? 'Replace slot' : 'Verify slot'}
        </AdminButton>
      ) : null}
    </article>
  )
}

function HardwareAttestation({
  orderId,
  item,
  onWorkspace,
}: {
  orderId: string
  item: AdminSignatureVoiceItem
  onWorkspace: (workspace: Workspace) => void
}) {
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const narrationComplete = item.narration.every((slot) => Boolean(slot.track))
  const triageAccepted = item.triage.technicalStatus === 'accepted'
    && item.triage.adultDeclarationStatus === 'accepted'
  const ready = narrationComplete && triageAccepted

  useEffect(() => {
    setAccepted(false)
    setFeedback(null)
  }, [item.hardware.status, item.source.assetId])

  const attest = async () => {
    if (!accepted || !ready || saving || item.hardware.status === 'attested') return
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/signature-voice/${encodeURIComponent(item.creationId)}/hardware-attestation`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accepted: true,
            cartItemId: item.cartItemId,
            creationId: item.creationId,
            sourceAssetId: item.source.assetId,
          }),
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.workspace) {
        throw new Error(data?.error || 'Failed to confirm hardware loading')
      }
      onWorkspace(data.workspace as Workspace)
      setFeedback({ tone: 'success', text: 'Hardware loading confirmed.' })
    } catch (error) {
      setFeedback({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to confirm hardware loading',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_76%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_52%,transparent)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_14%,transparent)] text-[var(--admin-accent-dp)]">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-[var(--admin-page-ink)]">Physical audio hardware</h4>
            <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">
              {item.hardware.status === 'attested'
                ? `${item.hardware.attestedByName || 'Admin'} / ${formatTimestamp(item.hardware.attestedAt)}`
                : `${item.narration.filter((slot) => slot.track).length}/15 narration tracks`}
            </p>
          </div>
        </div>
        <AdminStatusBadge tone={item.hardware.status === 'attested' ? 'success' : 'warning'}>
          {item.hardware.status === 'attested' ? 'Loaded' : 'Not confirmed'}
        </AdminStatusBadge>
      </div>

      {item.hardware.status !== 'attested' ? (
        <div className="mt-4">
          <label className={`flex items-start gap-3 rounded-lg border px-3 py-3 ${
            ready
              ? 'cursor-pointer border-[var(--admin-card-line)] bg-[color-mix(in_srgb,var(--admin-card)_44%,transparent)]'
              : 'cursor-not-allowed border-[color-mix(in_srgb,var(--admin-card-line)_55%,transparent)] opacity-60'
          }`}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent-dp)]"
              checked={accepted}
              disabled={!ready || saving}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span className="text-sm font-semibold text-[var(--admin-page-ink)]">
              I confirm all 15 verified narration tracks are loaded into this item&apos;s physical audio hardware.
            </span>
          </label>
          <div className="mt-3 flex justify-end">
            <AdminButton
              type="button"
              tone="primary"
              disabled={!ready || !accepted || saving}
              onClick={() => void attest()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              {saving ? 'Verifying...' : 'Confirm hardware loaded'}
            </AdminButton>
          </div>
        </div>
      ) : null}
      {feedback ? <AdminNotice tone={feedback.tone} className="mt-3">{feedback.text}</AdminNotice> : null}
    </section>
  )
}

function VoiceItem({
  orderId,
  item,
  onWorkspace,
}: {
  orderId: string
  item: AdminSignatureVoiceItem
  onWorkspace: (workspace: Workspace) => void
}) {
  return (
    <article className="admin-v2-order-bubble p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge tone="inverse">Signature Voice</AdminStatusBadge>
            <AdminStatusBadge tone={triageTone(item.triage.technicalStatus)}>
              Technical {item.triage.technicalStatus}
            </AdminStatusBadge>
            <AdminStatusBadge tone={triageTone(item.triage.adultDeclarationStatus)}>
              Authorization {item.triage.adultDeclarationStatus}
            </AdminStatusBadge>
          </div>
          <h3 className="mt-2 text-base font-bold text-[var(--admin-page-ink)]">{item.title}</h3>
          <p className="mt-1 text-xs text-[var(--admin-page-muted)]">
            {item.declaration.subjectName} / {RELATIONSHIP_LABELS[item.declaration.subjectRelationship]} / Revision {item.triage.sourceRevision}
          </p>
        </div>
        <span className="text-xs font-semibold text-[var(--admin-page-muted)]">Qty {item.quantity}</span>
      </div>

      <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_72%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_48%,transparent)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Headphones className="h-4 w-4 shrink-0 text-[var(--admin-accent-dp)]" />
            <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">
              {item.source.durationSeconds.toFixed(1)} sec / {formatBytes(item.source.sizeBytes)}
            </p>
          </div>
          <a
            href={item.source.downloadUrl}
            className="admin-v2-button admin-v2-button--secondary shrink-0"
            download
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
        <audio
          key={item.source.assetId}
          controls
          preload="metadata"
          src={item.source.playbackUrl}
          className="mt-3 w-full"
        />
      </div>

      <div className="mt-3 grid gap-3">
        <TriageEditor orderId={orderId} item={item} onWorkspace={onWorkspace} />
        <ReplacementUploader orderId={orderId} item={item} onWorkspace={onWorkspace} />
      </div>

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-[var(--admin-page-ink)]">Narration archive</h4>
            <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">15 logical spreads</p>
          </div>
          <AdminStatusBadge tone={item.narration.every((slot) => slot.track) ? 'success' : 'warning'}>
            {item.narration.filter((slot) => slot.track).length}/15 verified
          </AdminStatusBadge>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {item.narration.map((slot) => (
            <NarrationSlotEditor
              key={slot.slotKey}
              orderId={orderId}
              item={item}
              slot={slot}
              onWorkspace={onWorkspace}
            />
          ))}
        </div>
      </section>
      <HardwareAttestation orderId={orderId} item={item} onWorkspace={onWorkspace} />
    </article>
  )
}

export function SignatureVoiceWorkspace({
  orderId,
  orderLabel,
  onClose,
}: {
  orderId: string
  orderLabel: string
  onClose: () => void
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestIntentRef = useRef(0)

  const load = useCallback(async () => {
    const intent = ++requestIntentRef.current
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/signature-voice`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.workspace) {
        throw new Error(data?.error || 'Failed to load Signature Voice production')
      }
      if (requestIntentRef.current === intent) setWorkspace(data.workspace as Workspace)
    } catch (loadError) {
      if (requestIntentRef.current === intent) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load Signature Voice production')
      }
    } finally {
      if (requestIntentRef.current === intent) setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
    return () => { requestIntentRef.current += 1 }
  }, [load])

  return (
    <AdminFloatingDialog
      onClose={onClose}
      eyebrow={orderLabel}
      title="Signature Voice"
      subtitle={workspace ? `${workspace.order.customerName}${workspace.order.email ? ` / ${workspace.order.email}` : ''}` : undefined}
      maxWidthClassName="max-w-5xl"
      placement="center"
      backdrop="blur"
      bodyClassName="p-3 sm:p-5"
    >
      {loading ? (
        <div className="grid min-h-48 place-items-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--admin-accent-dp)]" />
        </div>
      ) : error ? (
        <AdminNotice tone="danger" className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <AdminIconButton type="button" tone="quiet" onClick={() => void load()} aria-label="Retry">
            <RefreshCw className="h-4 w-4" />
          </AdminIconButton>
        </AdminNotice>
      ) : !workspace || workspace.items.length === 0 ? (
        <AdminEmptyState>No bound Signature Voice source was found.</AdminEmptyState>
      ) : (
        <div className="grid gap-4">
          {workspace.items.map((item) => (
            <VoiceItem
              key={item.creationId}
              orderId={orderId}
              item={item}
              onWorkspace={setWorkspace}
            />
          ))}
        </div>
      )}
    </AdminFloatingDialog>
  )
}
