export const STORAGE_BUCKET_NOT_SIGNABLE_CODE = 'storage_bucket_not_signable' as const

export const SIGNABLE_STORAGE_BUCKETS = ['raw-private'] as const

export class StorageSigningPolicyError extends Error {
  readonly code = STORAGE_BUCKET_NOT_SIGNABLE_CODE

  constructor() {
    super(STORAGE_BUCKET_NOT_SIGNABLE_CODE)
    this.name = 'StorageSigningPolicyError'
  }
}

export function assertSignableStorageBucket(bucket: unknown): string {
  if (
    typeof bucket !== 'string' ||
    !SIGNABLE_STORAGE_BUCKETS.some((allowedBucket) => allowedBucket === bucket)
  ) {
    throw new StorageSigningPolicyError()
  }

  return bucket
}

