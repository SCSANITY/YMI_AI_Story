export type ChildProfileMetadata = {
  child_name?: string
  child_age?: number
  name?: string
  age?: number
  gender?: string
}

export type UserTextProfile = {
  asset_id: string
  metadata?: ChildProfileMetadata
  created_at?: string
}

export type SaveTextProfileResult = {
  saved: boolean
  reason?: string
  error?: string
  profile?: UserTextProfile
}
