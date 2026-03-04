import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'
import { checkJobQueueGuard } from '@/lib/jobQueue'

const MAX_TEXT_PROFILES = 5

async function saveTextProfile({
  ownerType,
  ownerId,
  textOverrides,
}) {
  if (!ownerId || !textOverrides) {
    return { saved: false, reason: 'missing_owner_or_text' }
  }

  const childName = textOverrides?.child_name || textOverrides?.childName
  const rawAge = textOverrides?.child_age ?? textOverrides?.age
  const gender = textOverrides?.gender

  if (!childName || rawAge === undefined || rawAge === null) {
    return { saved: false, reason: 'missing_fields' }
  }

  const ageNumber = Number.parseInt(String(rawAge), 10)
  if (Number.isNaN(ageNumber)) {
    return { saved: false, reason: 'invalid_age' }
  }

  const metadata = {
    child_name: String(childName),
    age: ageNumber,
    ...(gender ? { gender: String(gender) } : {}),
  }

  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .eq('metadata->>child_name', metadata.child_name)
    .eq('metadata->>age', String(metadata.age))
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return { saved: false, reason: 'lookup_failed', error: existingError.message }
  }

  if (existing?.asset_id) {
    const { error: updateError } = await supabaseAdmin
      .from('user_assets')
      .update({ created_at: new Date().toISOString(), metadata })
      .eq('asset_id', existing.asset_id)
    if (updateError) {
      return { saved: false, reason: 'update_failed', error: updateError.message }
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from('user_assets').insert({
      owner_type: ownerType,
      [ownerColumn]: ownerId,
      asset_type: 'text_profile',
      storage_path: null,
      metadata,
    })
    if (insertError) {
      return { saved: false, reason: 'insert_failed', error: insertError.message }
    }
  }

  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_TEXT_PROFILES) {
    const toRemove = assets.slice(0, assets.length - MAX_TEXT_PROFILES).map((row) => row.asset_id)
    if (toRemove.length) {
      const { error: deleteError } = await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
      if (deleteError) {
        return { saved: false, reason: 'cleanup_failed', error: deleteError.message }
      }
    }
  }

  return { saved: true }
}

export async function POST(request) {
  const body = await request.json()
  const templateId = body?.template_id || body?.templateId
  const faceAssetId = body?.face_asset_id || body?.faceAssetId
  const textOverrides = body?.text_overrides || body?.textOverrides || null
  const params = body?.params || null

  if (!templateId || !faceAssetId) {
    return NextResponse.json({ error: 'Missing template_id or face_asset_id' }, { status: 400 })
  }

  const queueGuard = await checkJobQueueGuard({
    jobType: 'preview',
    incomingJobs: 1,
  })
  if (!queueGuard.allowed) {
    return NextResponse.json(
      {
        error: queueGuard.message,
        code: 'queue_overloaded',
        guard: queueGuard,
      },
      { status: 429 }
    )
  }

  const ownerType = body?.customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? body?.customerId : anonSessionId

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .select('storage_path')
    .eq('asset_id', faceAssetId)
    .single()

  if (assetError || !asset?.storage_path) {
    return NextResponse.json({ error: 'Face asset not found' }, { status: 404 })
  }

  const { data: template, error: templateError } = await supabaseAdmin
    .from('templates')
    .select('default_config_path')
    .eq('template_id', templateId)
    .single()

  if (templateError || !template?.default_config_path) {
    return NextResponse.json({ error: 'Template config path missing' }, { status: 400 })
  }

  const rawConfigPath = String(template.default_config_path).trim()
  const configUrl = rawConfigPath.startsWith('http')
    ? rawConfigPath
    : supabaseAdmin.storage
        .from('app-templates')
        .getPublicUrl(rawConfigPath.replace(/^app-templates\//, '').replace(/^\/+/, ''))
        .data?.publicUrl

  if (!configUrl) {
    return NextResponse.json({ error: 'Failed to resolve config URL' }, { status: 500 })
  }

  const rawFacePath = `raw-private/${asset.storage_path}`
  const customizeSnapshot = {
    storagePath: asset.storage_path ?? null,
    textOverrides: textOverrides ?? null,
    params: params ?? null,
    previewJobId: null,
  }

  const { data: creation, error: creationError } = await supabaseAdmin
    .from('creations')
    .insert({
      owner_type: ownerType,
      customer_id: ownerType === 'customer' ? body.customerId : null,
      anon_session_id: ownerType === 'anon' ? anonSessionId : null,
      template_id: templateId,
      customize_snapshot: customizeSnapshot,
      preview_job_id: null,
    })
    .select('creation_id')
    .single()

  if (creationError || !creation?.creation_id) {
    return NextResponse.json({ error: 'Failed to create creation' }, { status: 500 })
  }

  const [jobResult, textProfileResult] = await Promise.all([
    supabaseAdmin
      .from('jobs')
      .insert({
        owner_type: ownerType,
        anon_session_id: ownerType === 'anon' ? anonSessionId : null,
        customer_id: ownerType === 'customer' ? body.customerId : null,
        template_id: templateId,
        creation_id: creation.creation_id,
        job_type: 'preview',
        status: 'queued',
        progress: 0,
        input_snapshot: {
          face_source_path: rawFacePath,
          config_url: configUrl,
          text_overrides: textOverrides,
          params,
        },
      })
      .select('job_id')
      .single(),
    saveTextProfile({
      ownerType,
      ownerId,
      textOverrides,
    }),
  ])

  const { data: job, error } = jobResult

  if (error || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
  if (!job.job_id) {
    return NextResponse.json({ error: 'Missing job_id after insert' }, { status: 500 })
  }
  await supabaseAdmin
    .from('creations')
    .update({
      preview_job_id: job.job_id,
      updated_at: new Date().toISOString(),
    })
    .eq('creation_id', creation.creation_id)

  return NextResponse.json({
    jobId: job.job_id,
    job_id: job.job_id,
    creationId: creation.creation_id,
    creation_id: creation.creation_id,
    text_profile: textProfileResult ?? null,
  })
}

export async function PATCH(request) {
  const body = await request.json()
  const jobId = body?.jobId
  const faceSourcePath = body?.face_source_path || body?.faceSourcePath || null
  const faceAssetId = body?.face_asset_id || body?.faceAssetId || null
  const textOverrides = body?.textOverrides ?? null
  const params = body?.params ?? null

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('input_snapshot')
    .eq('job_id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  let resolvedFaceSourcePath = faceSourcePath

  if (!resolvedFaceSourcePath && faceAssetId) {
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('user_assets')
      .select('storage_path')
      .eq('asset_id', faceAssetId)
      .single()

    if (assetError || !asset?.storage_path) {
      return NextResponse.json({ error: 'Face asset not found' }, { status: 404 })
    }

    resolvedFaceSourcePath = `raw-private/${asset.storage_path}`
  }

  if (!resolvedFaceSourcePath && textOverrides === null && params === null) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const inputSnapshot = {
    ...(job.input_snapshot || {}),
    ...(resolvedFaceSourcePath ? { face_source_path: resolvedFaceSourcePath } : {}),
    text_overrides: textOverrides ?? (job.input_snapshot || {}).text_overrides,
    params: params ?? (job.input_snapshot || {}).params,
  }

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      input_snapshot: inputSnapshot,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', jobId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
