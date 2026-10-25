// Read the same server lock authority as purchase configuration, before any carry save.
export async function readPreviewVersionLock(target: { creationId: string; jobId: string }, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`/api/creations/${encodeURIComponent(target.creationId)}?includePhotoLock=1`, {
    credentials: 'include', cache: 'no-store', signal,
  })
  const data = await response.json().catch(() => null)
  const lock = data?.photoLock
  if (!response.ok || data?.creation?.creation_id !== target.creationId
    || data?.creation?.preview_job_id !== target.jobId
    || typeof lock?.hasCartAttachment !== 'boolean'
    || !['unpurchased', 'purchased', 'refunded'].includes(lock?.purchaseState)) {
    throw new Error('Unable to verify this version. Your current version has been kept.')
  }
  return lock.hasCartAttachment || lock.purchaseState !== 'unpurchased'
}
