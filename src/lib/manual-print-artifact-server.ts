import {
  MANUAL_PRINT_PDF_BUCKET,
  type ManualPrintArtifactClient,
} from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DOWNLOAD_TTL_SECONDS = 60 * 20

export type ManualPrintArtifactRow = {
  artifact_id: string
  final_job_id: string
  storage_bucket: string
  storage_path: string
  original_filename: string
  declared_size_bytes: number
  verified_size_bytes: number | null
  content_type: string
  status: string
  created_at: string
  verified_at: string | null
  released_at: string | null
}

export const MANUAL_PRINT_ARTIFACT_SELECT =
  'artifact_id, final_job_id, storage_bucket, storage_path, original_filename, declared_size_bytes, verified_size_bytes, content_type, status, created_at, verified_at, released_at'

export async function buildManualPrintArtifactClient(
  row: ManualPrintArtifactRow
): Promise<ManualPrintArtifactClient> {
  if (
    row.storage_bucket !== MANUAL_PRINT_PDF_BUCKET ||
    row.content_type !== 'application/pdf' ||
    (row.status !== 'verified' && row.status !== 'released') ||
    !row.verified_at ||
    !row.verified_size_bytes
  ) {
    throw new Error('Manual print PDF is not verified')
  }

  const { data, error } = await supabaseAdmin.storage
    .from(MANUAL_PRINT_PDF_BUCKET)
    .createSignedUrl(row.storage_path, DOWNLOAD_TTL_SECONDS, {
      download: row.original_filename,
    })
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to sign manual print PDF')
  }

  return {
    artifact_id: row.artifact_id,
    original_filename: row.original_filename,
    size_bytes: Number(row.verified_size_bytes),
    content_type: 'application/pdf',
    status: row.status,
    uploaded_at: row.created_at,
    verified_at: row.verified_at,
    released_at: row.released_at,
    download_url: data.signedUrl,
  }
}
