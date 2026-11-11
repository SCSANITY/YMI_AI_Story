export async function loadSavedPhoto(
  initialUrl: string | null,
  refreshUrl: (signal: AbortSignal) => Promise<string | null>,
  signal: AbortSignal,
): Promise<File> {
  const read = (url: string) => fetch(url, {
    signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  let response = initialUrl ? await read(initialUrl) : null
  if (!response || [400, 401, 403, 404].includes(response.status)) {
    const url = await refreshUrl(signal)
    if (url) response = await read(url)
  }
  if (!response?.ok || signal.aborted) throw new Error('Saved photo unavailable')
  const blob = await response.blob()
  return new File([blob], 'saved-photo', { type: blob.type })
}
