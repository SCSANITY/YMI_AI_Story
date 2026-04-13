import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)
  const url = new URL(request.url)
  const pagesParam = url.searchParams.get('pages')
  const limitParam = url.searchParams.get('limit')
  const sizeParam = url.searchParams.get('size') || 'small'

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select('status, output_assets')
    .eq('job_id', jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'done') {
    return NextResponse.json({ error: 'Job not completed' }, { status: 400 })
  }

  const outputAssets = job.output_assets as
    | {
        storage_path?: string
        bucket?: string
        pages?: { page_index: number; preview_order?: number; storage_path: string; storage_path_full?: string }[]
      }
    | null
  const bucket = outputAssets?.bucket || 'raw-private'

  const pages = Array.isArray(outputAssets?.pages) ? outputAssets?.pages ?? [] : []
  const sortedPages = [...pages].sort((a, b) => {
    const orderA = typeof a.preview_order === 'number' ? a.preview_order : Number.MAX_SAFE_INTEGER
    const orderB = typeof b.preview_order === 'number' ? b.preview_order : Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) {
      return orderA - orderB
    }
    return a.page_index - b.page_index
  })

  let requestedIndices: number[] | null = null
  if (pagesParam) {
    requestedIndices = pagesParam
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
  } else if (limitParam) {
    const limit = Number.parseInt(limitParam, 10)
    if (Number.isFinite(limit) && limit > 0) {
      requestedIndices = sortedPages.slice(0, limit).map((page) => page.page_index)
    }
  }

  const pagePaths = requestedIndices?.length
    ? requestedIndices
        .map((index) => sortedPages.find((page) => page.page_index === index))
        .filter(Boolean)
        .map((page) => {
          const pageData = page as { page_index: number; storage_path: string; storage_path_full?: string }
          if (sizeParam === 'full' && pageData.storage_path_full) {
            return pageData.storage_path_full
          }
          return pageData.storage_path
        })
    : []

  const storagePaths = pagePaths.length
    ? pagePaths
    : outputAssets?.storage_path
    ? [outputAssets.storage_path]
    : sortedPages.map((page) => {
        if (sizeParam === 'full' && page.storage_path_full) {
          return page.storage_path_full
        }
        return page.storage_path
      })

  if (!storagePaths.length) {
    return NextResponse.json({ error: 'Preview asset missing' }, { status: 400 })
  }

  const signedResults = await Promise.all(
    storagePaths.map(async (path) => {
      const { data: signed, error: signedError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 10)
      if (signedError || !signed?.signedUrl) {
        throw new Error('Failed to sign URL')
      }
      return signed.signedUrl
    })
  ).catch(() => null)

  if (!signedResults) {
    return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })
  }
  const signedUrls = signedResults

  if (signedUrls.length === 1) {
    return NextResponse.json({ url: signedUrls[0] })
  }

  return NextResponse.json({ urls: signedUrls })
}
