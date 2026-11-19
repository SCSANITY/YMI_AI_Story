import { downloadZip } from 'client-zip'
import { clickBlobDownload } from './admin-approved-source-export-client'

type ArtworkPlan = { archiveName: string; files: { name: string; url: string }[] }

export async function downloadStoryFile(endpoint: string, artwork: boolean, signal: AbortSignal) {
  const response = await fetch(endpoint, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Could not retrieve story file')
  if (!artwork) {
    const blob = await response.blob()
    signal.throwIfAborted()
    clickBlobDownload(blob, 'Manual-subtitle-template.json')
    return
  }
  const plan: ArtworkPlan = await response.json()
  if (!plan.files.length) throw new Error('No story artwork available')
  async function* inputs() {
    for (const file of plan.files) {
      const image = await fetch(file.url, { signal, credentials: 'omit', cache: 'no-store' })
      if (!image.ok || !image.body) throw new Error('Could not download artwork')
      yield { name: file.name, input: image }
    }
  }
  const archive = await downloadZip(inputs()).blob()
  signal.throwIfAborted()
  clickBlobDownload(archive, plan.archiveName)
}
