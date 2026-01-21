import { supabase } from '@/lib/supabase'

export interface JobRecord {
  id: string
  job_type: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  input_payload: Record<string, unknown>
  output_payload?: Record<string, unknown> | null
  created_at?: string
}

export async function createPreviewJob(
  assetId: string,
  templateId: string
): Promise<string> {
  if (!assetId) throw new Error('Asset ID is required')
  if (!templateId) throw new Error('Template ID is required')

  const input_payload = {
    face_asset_id: assetId,
    template_id: templateId,
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      job_type: 'preview_face',
      status: 'pending',
      input_payload,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
