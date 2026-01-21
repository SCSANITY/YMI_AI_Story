import { supabase } from '@/lib/supabase'

export type AssetType = 'image' | 'audio'

export interface UserAssetRecord {
  id: string
  user_id: string
  type: AssetType
  storage_path: string
  created_at?: string
}

function getFileExtension(file: File): string {
  const name = file.name || ''
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex > -1 && dotIndex < name.length - 1) {
    return name.slice(dotIndex + 1).toLowerCase()
  }
  if (file.type.includes('/')) {
    return file.type.split('/')[1].toLowerCase()
  }
  return 'bin'
}

function buildStoragePath(userId: string, file: File): string {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const extension = getFileExtension(file)
  return `${userId}/${uniqueId}.${extension}`
}

export async function uploadUserAsset(
  file: File,
  userId: string,
  type: AssetType
): Promise<UserAssetRecord> {
  if (!file) throw new Error('File is required')
  if (!userId) throw new Error('User ID is required')

  const storagePath = buildStoragePath(userId, file)

  const { error: uploadError } = await supabase.storage
    .from('raw-private')
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('user_assets')
    .insert({
      user_id: userId,
      type,
      storage_path: storagePath,
    })
    .select()
    .single()

  if (error) throw error
  return data as UserAssetRecord
}
