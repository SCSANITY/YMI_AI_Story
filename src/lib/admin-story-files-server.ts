import { supabaseAdmin } from '@/lib/supabaseAdmin'

const subtitleName = 'Manual-subtitle-template.json'
const pageSize = 100

function templateBucket(template: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(template)) throw new Error('Invalid story folder')
  return supabaseAdmin.storage.from('app-templates')
}

export async function hasStorySubtitle(template: string) {
  const { data, error } = await templateBucket(template).list(template, { search: subtitleName, limit: 100 })
  if (error) throw error
  return data.some((entry) => entry.id && entry.name === subtitleName)
}

export async function readStorySubtitle(template: string) {
  const { data, error } = await templateBucket(template).download(template + '/' + subtitleName)
  if (error) {
    if (['404', 'NoSuchKey', 'not_found'].includes(String(error.statusCode ?? error.name))) return null
    throw error
  }
  return new Response(data, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="' + subtitleName + '"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function planStoryArtwork(template: string, signal: AbortSignal) {
  const bucket = templateBucket(template)
  const root = template + '/final/'
  const folders = ['']
  const files: { name: string; url: string }[] = []
  for (const folder of folders) {
    const prefix = root + folder
    for (let offset = 0; ; offset += pageSize) {
      signal.throwIfAborted()
      const { data, error } = await bucket.list(prefix.replace(/\/$/, ''), {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      const paths: string[] = []
      for (const entry of data) {
        if (!entry.name || entry.name === '.' || entry.name === '..' || /[/\\:\x00-\x1f]/.test(entry.name))
          throw new Error('Invalid artwork filename')
        if (!entry.id) folders.push(folder + entry.name + '/')
        else if (
          entry.metadata?.mimetype?.startsWith('image/') ||
          /\.(?:png|jpe?g|webp|gif|avif|heic|tiff?|bmp)$/i.test(entry.name)
        )
          paths.push(prefix + entry.name)
      }
      if (paths.length) {
        signal.throwIfAborted()
        const signed = await bucket.createSignedUrls(paths, 1800)
        if (signed.error) throw signed.error
        const urls = new Map(signed.data.map((row) => [row.path, row.signedUrl]))
        for (const path of paths) {
          const url = urls.get(path)
          if (!url) throw new Error('Incomplete artwork download')
          files.push({ name: path.slice(root.length), url })
        }
      }
      if (data.length < pageSize) break
    }
  }
  return { archiveName: template + '-artwork.zip', files }
}
