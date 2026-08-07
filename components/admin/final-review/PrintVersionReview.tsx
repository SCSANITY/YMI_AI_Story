import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileUp,
  Loader2,
  Lock,
  ShieldCheck,
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
      <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">
        Loading print handoff...
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className={`rounded-2xl border p-4 text-sm leading-6 ${
        pdfReleased
          ? 'border-amber-300/20 bg-amber-300/10 text-amber-50'
          : 'border-white/10 bg-white/[0.05] text-slate-400'
      }`}>
        {pdfReleased
          ? 'Export the approved source images from PDF Review, prepare the printer-ready PDF offline, then upload the complete file here.'
          : 'Print handoff is locked until the customer PDF has been released.'}
      </div>

      <section className="overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/40">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              artifact ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'
            }`}>
              {artifact ? <FileCheck2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Manual print artifact
              </p>
              <h4 className="mt-1 text-lg font-bold text-white">
                {artifact ? 'Verified printer PDF' : 'Awaiting printer PDF'}
              </h4>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                This private file is separate from the lower-resolution customer viewing PDF.
              </p>
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
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-100 transition hover:bg-white/[0.1]"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              ) : null}
              <button
                type="button"
                onClick={onUploadPrintPdf}
                disabled={!pdfReleased || printReleased || uploading}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2.5 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Replace before release
              </button>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2.5 text-xs leading-5 text-emerald-100">
              {printReleased ? <Lock className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
              {printReleased
                ? 'Print Release locked this exact revision. Upload and replacement are disabled.'
                : 'The server verified the stored MIME type, byte count, and PDF signature. Print Release will lock this exact revision.'}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-dashed border-amber-200/25 bg-amber-200/[0.04] px-5 py-8 text-center">
              {pdfReleased ? (
                <>
                  <FileUp className="mx-auto h-7 w-7 text-amber-200" />
                  <p className="mt-3 text-sm font-bold text-white">Upload one complete printer-ready PDF</p>
                  <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-400">
                    PDF only, up to 250 MiB. The upload goes directly to private Storage and is verified before it can be released.
                  </p>
                </>
              ) : (
                <>
                  <Lock className="mx-auto h-7 w-7 text-slate-500" />
                  <p className="mt-3 text-sm font-bold text-slate-300">Release the customer PDF first</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onUploadPrintPdf}
              disabled={!pdfReleased || printReleased || uploading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-200 px-4 py-3 text-sm font-bold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Uploading and verifying...' : 'Choose printer PDF'}
            </button>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-slate-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        Print Release records the operational handoff only. It does not rebuild the file, run the Worker, replace the customer PDF, or send another customer email.
      </div>
    </div>
  )
}

function ArtifactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-200">{value}</p>
    </div>
  )
}
