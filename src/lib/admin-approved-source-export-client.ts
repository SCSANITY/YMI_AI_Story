'use client'

import { downloadZip } from 'client-zip'

export type ApprovedSourceExportClientFile = {
  page_index: number
  output_order: number
  role: string
  spread_index: number | null
  side: 'left' | 'right' | null
  page_number: number | null
  approved_source: 'ai' | 'manual' | null
  reviewed_at: string | null
  entry_base_name: string
  signed_url: string
}

export type ApprovedSourceExportResponse = {
  archiveName: string
  manifestName: string
  manifest: Record<string, unknown>
  files: ApprovedSourceExportClientFile[]
}

type FileSystemFileHandleLike = {
  createWritable: () => Promise<WritableStream<Uint8Array>>
}

function imageExtension(contentType: string | null) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/jpeg') return 'jpg'
  if (normalized === 'image/webp') return 'webp'
  throw new Error(`Approved source has unsupported content type: ${normalized || 'unknown'}`)
}

function clickBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function requestApprovedSourceZipDestination(suggestedName: string) {
  const picker = (window as typeof window & {
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandleLike>
  }).showSaveFilePicker
  if (!picker) return null
  return picker({
    suggestedName,
    types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
  })
}

async function fetchApprovedSource(file: ApprovedSourceExportClientFile) {
  const response = await fetch(file.signed_url, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to download approved Final page ${file.page_index}`)
  }
  const extension = imageExtension(response.headers.get('content-type'))
  return {
    response,
    fileName: `${file.entry_base_name}.${extension}`,
  }
}

export async function downloadSingleApprovedSource(plan: ApprovedSourceExportResponse) {
  const file = plan.files[0]
  if (!file || plan.files.length !== 1) throw new Error('Single-page export requires exactly one page')
  const { response, fileName } = await fetchApprovedSource(file)
  clickBlobDownload(await response.blob(), fileName)
}

export async function downloadApprovedSourceZip(
  plan: ApprovedSourceExportResponse,
  destination: Promise<FileSystemFileHandleLike> | null
) {
  const manifestFiles: Array<Record<string, unknown>> = []
  async function* zipInputs() {
    for (const file of plan.files) {
      const { response, fileName } = await fetchApprovedSource(file)
      manifestFiles.push({
        file_name: fileName,
        page_index: file.page_index,
        output_order: file.output_order,
        role: file.role,
        spread_index: file.spread_index,
        side: file.side,
        page_number: file.page_number,
        approved_source: file.approved_source,
        reviewed_at: file.reviewed_at,
      })
      yield { input: response, name: fileName }
    }
    yield {
      input: `${JSON.stringify({ ...plan.manifest, files: manifestFiles }, null, 2)}\n`,
      name: plan.manifestName,
    }
  }

  const archive = downloadZip(zipInputs())
  if (destination) {
    const fileHandle = await destination
    if (!archive.body) throw new Error('ZIP archive stream is unavailable')
    await archive.body.pipeTo(await fileHandle.createWritable())
    return
  }
  clickBlobDownload(await archive.blob(), plan.archiveName)
}
