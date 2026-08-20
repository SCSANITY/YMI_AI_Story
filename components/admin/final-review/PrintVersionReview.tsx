import {
  Download,
  FileCheck2,
  FileUp,
  Loader2,
  Lock,
} from 'lucide-react'
import type { ManualPrintArtifactClient } from '@/lib/manual-print-artifact'
import { formatDate } from './reviewUi'

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
  onUploadPrintPdf,
}: {
  loadingDetail: boolean
  pdfReleased: boolean
  printReleased: boolean
  artifact: ManualPrintArtifactClient | null
  uploading: boolean
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
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
                Manual print artifact
              </p>
              <h4 className="mt-1 text-lg font-bold text-[var(--admin-ink)]">
                {artifact ? 'Verified printer PDF' : 'Awaiting printer PDF'}
              </h4>
            </div>
          </div>
        </div>

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
                  <p className="mt-2 text-xs text-[var(--admin-muted)]">PDF · max 250 MiB</p>
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

function ArtifactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--admin-ink)]">{value}</p>
    </div>
  )
}
