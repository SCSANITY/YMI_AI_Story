import {
  AlertCircle,
  Download,
  FileCheck2,
  FileUp,
  Loader2,
  Lock,
} from 'lucide-react'
import type { ManualPrintArtifactClient } from '@/lib/manual-print-artifact'
import { formatDate } from './reviewUi'

type PrintUploadProgressValue = {
  fileName: string
  percent: number
  phase: 'preparing' | 'uploading' | 'verifying'
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size'
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MiB`
}

export function PrintVersionReview({
  loadingDetail,
  pdfReleased,
  printReleased,
  artifact,
  uploading,
  uploadProgress,
  uploadError,
  onUploadPrintPdf,
}: {
  loadingDetail: boolean
  pdfReleased: boolean
  printReleased: boolean
  artifact: ManualPrintArtifactClient | null
  uploading: boolean
  uploadProgress: PrintUploadProgressValue | null
  uploadError: string | null
  onUploadPrintPdf: () => void
}) {
  if (loadingDetail) {
    return (
      <div className="mt-4 rounded-lg bg-[var(--admin-panel-2)] p-4 text-sm text-[var(--admin-muted)]">
        Loading print handoff...
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="overflow-hidden rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)]">
        <div className="border-b border-[var(--admin-card-line)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
              artifact ? 'bg-[color-mix(in_srgb,var(--admin-good)_13%,transparent)] text-[var(--admin-good)]' : 'bg-[color-mix(in_srgb,var(--admin-accent)_13%,transparent)] text-[var(--admin-accent-dp)]'
            }`}>
              {artifact ? <FileCheck2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                Manual print artifact
              </p>
              <h4 className="mt-1 text-lg font-bold text-[var(--admin-ink)]">
                {artifact ? 'Verified printer PDF' : 'Awaiting printer PDF'}
              </h4>
            </div>
          </div>
        </div>

        {uploadProgress || uploadError ? (
          <div className="space-y-3 px-5 pt-5">
            {uploadProgress ? <PrintUploadProgress progress={uploadProgress} /> : null}
            {uploadError ? <PrintUploadError message={uploadError} /> : null}
          </div>
        ) : null}

        {artifact ? (
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <ArtifactFact label="File" value={artifact.original_filename} />
              <ArtifactFact label="Size" value={formatBytes(artifact.size_bytes)} />
              <ArtifactFact label="Verified" value={formatDate(artifact.verified_at)} />
              <ArtifactFact
                label="State"
                value={artifact.status === 'released' ? 'Released and locked' : 'Verified and ready'}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {artifact.download_url ? (
                <a
                  href={artifact.download_url}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-4 py-2.5 text-sm font-bold text-[var(--admin-ink)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_7%,transparent)]"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              ) : null}
              <button
                type="button"
                onClick={onUploadPrintPdf}
                disabled={!pdfReleased || printReleased || uploading}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--admin-accent-dp)_28%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_13%,transparent)] px-4 py-2.5 text-sm font-bold text-[var(--admin-accent-ink)] transition hover:bg-[color-mix(in_srgb,var(--admin-accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Replace before release
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--admin-accent-dp)_30%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_8%,transparent)] px-5 py-8 text-center">
              {pdfReleased ? (
                <>
                  <FileUp className="mx-auto h-7 w-7 text-[var(--admin-accent-dp)]" />
                  <p className="mt-3 text-sm font-bold text-[var(--admin-ink)]">Upload one complete printer-ready PDF</p>
                  <p className="mt-2 text-xs text-[var(--admin-muted)]">PDF, max 600 MiB</p>
                </>
              ) : (
                <>
                  <Lock className="mx-auto h-7 w-7 text-[var(--admin-muted)]" />
                  <p className="mt-3 text-sm font-bold text-[var(--admin-muted)]">Release the customer PDF first</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onUploadPrintPdf}
              disabled={!pdfReleased || printReleased || uploading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--admin-accent)] px-4 py-3 text-sm font-bold text-[var(--admin-ink)] transition hover:bg-[var(--admin-accent-dp)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Uploading and verifying...' : 'Choose printer PDF'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function PrintUploadProgress({ progress }: { progress: PrintUploadProgressValue }) {
  const label = progress.phase === 'preparing'
    ? 'Preparing secure upload'
    : progress.phase === 'verifying'
      ? 'Upload complete, verifying PDF'
      : `Uploading, ${progress.percent}%`

  return (
    <div className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-3">
      <div className="grid min-w-0 gap-1 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
        <p className="truncate font-semibold text-[var(--admin-ink)]" title={progress.fileName}>
          {progress.fileName}
        </p>
        <span className="font-bold text-[var(--admin-accent-ink)] sm:text-right">{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Print PDF upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={label}
        className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--admin-ink)_10%,transparent)]"
      >
        <div
          className={`h-full rounded-full bg-[var(--admin-accent)] transition-[width] duration-150 ${
            progress.phase === 'verifying' ? 'animate-pulse' : ''
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  )
}

function PrintUploadError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-300/45 bg-rose-950/90 px-3 py-2.5 text-rose-50 shadow-sm backdrop-blur-md"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold">Upload rejected</p>
          <p className="mt-0.5 break-words text-xs leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  )
}

function ArtifactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--admin-ink)]">{value}</p>
    </div>
  )
}
