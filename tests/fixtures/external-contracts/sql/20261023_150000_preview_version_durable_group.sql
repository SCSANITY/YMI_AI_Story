-- PREVIEW-UIUX-001/P0. Schema/functions only; NOT APPLIED.
-- Owner-derived ancestry replaces the client-session quota. No business rows change.
DO $migration$
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','5s',true);
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=pg_catalog.to_regprocedure('public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)')
      AND pg_catalog.md5(p.prosrc)='cf4d2ffd68e18ad71e3095804df31b17'
      AND p.prosecdef AND 'search_path=""'=ANY(p.proconfig))
    OR pg_catalog.to_regprocedure('public.read_preview_version_group(uuid,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'preview_durable_group_baseline_drift';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated','public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('service_role','public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'preview_durable_group_acl_drift';
  END IF;
  EXECUTE $reader_ddl$
CREATE FUNCTION public.read_preview_version_group(
  p_creation_id uuid, p_owner_type text, p_owner_id uuid
) RETURNS TABLE (
  root_creation_id uuid, creation_id uuid, job_id uuid,
  is_original boolean, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $group$
DECLARE
  v_current uuid := p_creation_id;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_creation public.creations%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_template text;
  v_parent_job text;
  v_parent text;
BEGIN
  IF p_creation_id IS NULL OR p_owner_id IS NULL
    OR p_owner_type IS NULL OR p_owner_type NOT IN ('customer','anon') THEN
    RAISE EXCEPTION 'preview_version_request_invalid' USING ERRCODE = '22023';
  END IF;
  LOOP
    IF v_current = ANY(v_seen) THEN
      RAISE EXCEPTION 'preview_version_group_invalid' USING ERRCODE = '55000';
    END IF;
    v_seen := pg_catalog.array_append(v_seen,v_current);
    SELECT c.* INTO v_creation FROM public.creations c
    WHERE c.creation_id = v_current AND c.owner_type::text = p_owner_type
      AND ((p_owner_type='customer' AND c.customer_id=p_owner_id)
        OR (p_owner_type='anon' AND c.anon_session_id=p_owner_id));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'preview_version_source_not_owned' USING ERRCODE = '42501';
    END IF;
    IF v_template IS NULL THEN v_template := v_creation.template_id; END IF;
    IF v_creation.template_id IS DISTINCT FROM v_template
      OR (v_parent_job IS NOT NULL AND v_creation.preview_job_id::text IS DISTINCT FROM v_parent_job) THEN
      RAISE EXCEPTION 'preview_version_group_invalid' USING ERRCODE = '55000';
    END IF;
    SELECT j.* INTO v_job FROM public.jobs j
    WHERE j.job_id=v_creation.preview_job_id AND j.creation_id=v_current
      AND j.template_id=v_template AND j.job_type='preview'::public.job_type
      AND j.owner_type::text=p_owner_type
      AND ((p_owner_type='customer' AND j.customer_id=p_owner_id)
        OR (p_owner_type='anon' AND j.anon_session_id=p_owner_id));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'preview_version_group_invalid' USING ERRCODE = '55000';
    END IF;
    EXIT WHEN v_job.input_snapshot->'creation_version_fork'->>'kind' IS DISTINCT FROM 'change_photo';
    v_parent := v_job.input_snapshot->'creation_version_fork'->>'source_creation_id';
    v_parent_job := v_job.input_snapshot->'creation_version_fork'->>'source_preview_job_id';
    IF v_parent IS NULL OR v_parent_job IS NULL THEN
      RAISE EXCEPTION 'preview_version_group_invalid' USING ERRCODE = '55000';
    END IF;
    -- Resolve only an existing owned ancestor; malformed input is never a new root.
    SELECT c.creation_id INTO v_current FROM public.creations c
    WHERE c.creation_id::text=v_parent;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'preview_version_group_invalid' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  RETURN QUERY
  WITH RECURSIVE members(id, canonical_job, added_at) AS (
    SELECT c.creation_id,c.preview_job_id,c.created_at
    FROM public.creations c WHERE c.creation_id=v_current
    UNION
    SELECT c.creation_id,c.preview_job_id,c.created_at
    FROM members parent
    JOIN public.jobs j ON j.input_snapshot->'creation_version_fork'->>'source_creation_id'=parent.id::text
      AND j.input_snapshot->'creation_version_fork'->>'source_preview_job_id'=parent.canonical_job::text
      AND j.input_snapshot->'creation_version_fork'->>'kind'='change_photo'
    JOIN public.creations c ON c.creation_id=j.creation_id AND c.preview_job_id=j.job_id
    WHERE c.template_id=v_template AND j.template_id=v_template
      AND j.job_type='preview'::public.job_type
      AND c.owner_type::text=p_owner_type AND j.owner_type::text=p_owner_type
      AND ((p_owner_type='customer' AND c.customer_id=p_owner_id AND j.customer_id=p_owner_id)
        OR (p_owner_type='anon' AND c.anon_session_id=p_owner_id AND j.anon_session_id=p_owner_id))
  )
  SELECT v_current,m.id,m.canonical_job,m.id=v_current,m.added_at
  FROM members m ORDER BY (m.id=v_current) DESC,m.added_at,m.id;
END;
$group$;

  $reader_ddl$;
  EXECUTE $fork_ddl$
CREATE OR REPLACE FUNCTION public.fork_preview_creation_version(
  p_source_creation_id uuid,
  p_expected_source_preview_job_id uuid,
  p_owner_type text,
  p_owner_id uuid,
  p_variant_session_id uuid,
  p_request_id uuid,
  p_face_asset_id uuid
)
RETURNS TABLE (
  out_creation_id uuid,
  out_job_id uuid,
  out_reused boolean,
  out_session_version_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_creation public.creations%ROWTYPE;
  v_source_job public.jobs%ROWTYPE;
  v_face_asset public.user_assets%ROWTYPE;
  v_existing_job public.jobs%ROWTYPE;
  v_new_snapshot jsonb;
  v_config_url text;
  v_new_creation_id uuid;
  v_new_job_id uuid;
  v_session_count integer := 0;
  v_root_creation_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_copy_voice_on_create boolean := false;
BEGIN
  IF p_source_creation_id IS NULL
    OR p_expected_source_preview_job_id IS NULL
    OR p_owner_id IS NULL
    OR p_variant_session_id IS NULL
    OR p_request_id IS NULL
    OR p_face_asset_id IS NULL
    OR p_owner_type NOT IN ('anon', 'customer') THEN
    RAISE EXCEPTION 'preview_version_request_invalid' USING ERRCODE = '22023';
  END IF;

  -- preview_durable_group_v1: the browser session is never a quota authority.
  SELECT membership.root_creation_id INTO v_root_creation_id
  FROM public.read_preview_version_group(p_source_creation_id,p_owner_type,p_owner_id) membership
  LIMIT 1;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('preview-root:' || v_root_creation_id::text, 0)
  );

  SELECT creation.*
  INTO v_source_creation
  FROM public.creations creation
  WHERE creation.creation_id = p_source_creation_id
  FOR SHARE;

  IF NOT FOUND
    OR v_source_creation.owner_type::text IS DISTINCT FROM p_owner_type
    OR (p_owner_type = 'customer'
      AND v_source_creation.customer_id IS DISTINCT FROM p_owner_id)
    OR (p_owner_type = 'anon'
      AND v_source_creation.anon_session_id IS DISTINCT FROM p_owner_id) THEN
    RAISE EXCEPTION 'preview_version_source_not_owned' USING ERRCODE = '42501';
  END IF;

  IF v_source_creation.preview_job_id IS DISTINCT FROM p_expected_source_preview_job_id THEN
    RAISE EXCEPTION 'preview_version_source_conflict' USING ERRCODE = 'PT409';
  END IF;

  SELECT job.*
  INTO v_source_job
  FROM public.jobs job
  WHERE job.job_id = p_expected_source_preview_job_id
    AND job.creation_id = p_source_creation_id
    AND job.job_type = 'preview'::public.job_type
    AND job.owner_type::text = p_owner_type
    AND (
      (p_owner_type = 'customer' AND job.customer_id = p_owner_id)
      OR (p_owner_type = 'anon' AND job.anon_session_id = p_owner_id)
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview_version_source_job_missing' USING ERRCODE = '55000';
  END IF;
  -- A timed-out HTTP response may retry the same request. Return the
  -- already-created identity rather than producing a duplicate Creation.
  SELECT job.*
  INTO v_existing_job
  FROM public.jobs job
  WHERE job.owner_type::text = p_owner_type
    AND (
      (p_owner_type = 'customer' AND job.customer_id = p_owner_id)
      OR (p_owner_type = 'anon' AND job.anon_session_id = p_owner_id)
    )
    AND job.job_type = 'preview'::public.job_type
    AND job.input_snapshot->'creation_version_fork'->>'kind' = 'change_photo'
    AND job.input_snapshot->'creation_version_fork'->>'source_creation_id' =
      p_source_creation_id::text
    AND job.input_snapshot->'creation_version_fork'->>'source_preview_job_id' =
      p_expected_source_preview_job_id::text
    AND job.input_snapshot->'creation_version_fork'->>'request_id' =
      p_request_id::text
  ORDER BY job.created_at
  LIMIT 1;

  SELECT pg_catalog.count(*)::integer
  INTO v_session_count
  FROM public.read_preview_version_group(p_source_creation_id,p_owner_type,p_owner_id) membership
  WHERE NOT membership.is_original;

  IF v_existing_job.job_id IS NOT NULL THEN
    IF v_existing_job.input_snapshot->'creation_version_fork'->>'face_asset_id'
      IS DISTINCT FROM p_face_asset_id::text THEN
      RAISE EXCEPTION 'preview_version_source_conflict' USING ERRCODE = 'PT409';
    END IF;
    RETURN QUERY SELECT
      v_existing_job.creation_id,
      v_existing_job.job_id,
      true,
      v_session_count;
    RETURN;
  END IF;

  IF v_source_creation.is_archived
    OR v_source_creation.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'preview_version_source_unavailable' USING ERRCODE = '55000';
  END IF;

  IF v_source_job.status NOT IN (
    'queued'::public.job_status,
    'running'::public.job_status,
    'done'::public.job_status
  ) THEN
    RAISE EXCEPTION 'preview_version_source_terminal' USING ERRCODE = '55000';
  END IF;

  IF v_session_count >= 3 THEN
    RAISE EXCEPTION 'preview_version_limit' USING ERRCODE = '54000';
  END IF;

  SELECT asset.*
  INTO v_face_asset
  FROM public.user_assets asset
  WHERE asset.asset_id = p_face_asset_id
    AND asset.asset_type = 'face_image'::public.asset_type
    AND asset.owner_type::text = p_owner_type
    AND (
      (p_owner_type = 'customer' AND asset.customer_id = p_owner_id)
      OR (p_owner_type = 'anon' AND asset.anon_session_id = p_owner_id)
    )
  FOR SHARE;

  IF NOT FOUND
    OR nullif(pg_catalog.btrim(coalesce(v_face_asset.storage_path, '')), '') IS NULL
    OR v_face_asset.storage_path NOT LIKE 'user-assets/%' THEN
    RAISE EXCEPTION 'preview_version_face_asset_invalid' USING ERRCODE = '42501';
  END IF;

  v_config_url := nullif(
    pg_catalog.btrim(coalesce(v_source_job.input_snapshot->>'config_url', '')),
    ''
  );
  IF v_config_url IS NULL THEN
    RAISE EXCEPTION 'preview_version_config_missing' USING ERRCODE = '55000';
  END IF;

  v_new_snapshot := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      coalesce(v_source_creation.customize_snapshot, '{}'::jsonb),
      '{storagePath}',
      pg_catalog.to_jsonb(v_face_asset.storage_path),
      true
    ),
    '{previewJobId}',
    'null'::jsonb,
    true
  );

  v_copy_voice_on_create :=
    v_source_job.selected_book_type = 'Signature Voice'
    AND v_source_creation.voice_asset_id IS NOT NULL;

  SELECT created.creation_id, created.job_id
  INTO v_new_creation_id, v_new_job_id
  FROM public.create_preview_job(
    p_owner_type,
    CASE WHEN p_owner_type = 'anon' THEN p_owner_id ELSE NULL END,
    CASE WHEN p_owner_type = 'customer' THEN p_owner_id ELSE NULL END,
    v_source_creation.template_id,
    v_new_snapshot,
    'raw-private/' || v_face_asset.storage_path,
    v_config_url,
    v_source_job.input_snapshot->'text_overrides',
    v_source_job.input_snapshot->'params',
    v_source_job.story_language,
    v_source_job.selected_book_type,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_asset_id ELSE NULL END,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_sample_duration_seconds ELSE NULL END,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_consent_version ELSE NULL END,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_subject_name ELSE NULL END,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_subject_relationship ELSE NULL END,
    CASE WHEN v_copy_voice_on_create THEN v_source_creation.voice_capture_authorization_id ELSE NULL END
  ) AS created;

  IF v_new_creation_id IS NULL OR v_new_job_id IS NULL THEN
    RAISE EXCEPTION 'preview_version_create_failed' USING ERRCODE = '55000';
  END IF;

  -- The Preview worker contract stays the same as the source job. Purchase
  -- configuration and an optional bound voice are Creation state and are
  -- copied independently, including an unfinished Signature Voice choice.
  UPDATE public.creations creation
  SET customize_snapshot = pg_catalog.jsonb_set(
        v_new_snapshot,
        '{previewJobId}',
        pg_catalog.to_jsonb(v_new_job_id::text),
        true
      ),
      voice_asset_id = v_source_creation.voice_asset_id,
      voice_sample_duration_seconds = v_source_creation.voice_sample_duration_seconds,
      voice_consent_version = v_source_creation.voice_consent_version,
      voice_consent_accepted_at = v_source_creation.voice_consent_accepted_at,
      voice_bound_at = v_source_creation.voice_bound_at,
      voice_subject_name = v_source_creation.voice_subject_name,
      voice_subject_relationship = v_source_creation.voice_subject_relationship,
      voice_capture_authorization_id = v_source_creation.voice_capture_authorization_id,
      voice_speaker_kind = v_source_creation.voice_speaker_kind,
      updated_at = v_now
  WHERE creation.creation_id = v_new_creation_id;

  UPDATE public.jobs job
  SET input_snapshot = coalesce(job.input_snapshot, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'creation_version_fork',
          pg_catalog.jsonb_build_object(
            'kind', 'change_photo',
            'root_creation_id', v_root_creation_id::text,
            'source_creation_id', p_source_creation_id::text,
            'source_preview_job_id', p_expected_source_preview_job_id::text,
            'session_id', p_variant_session_id::text,
            'request_id', p_request_id::text,
            'face_asset_id', p_face_asset_id::text,
            'created_at', v_now
          )
        ),
      updated_at = v_now
  WHERE job.job_id = v_new_job_id
    AND job.creation_id = v_new_creation_id;

  INSERT INTO public.creation_dedications (creation_id, decision, body)
  SELECT v_new_creation_id, dedication.decision, dedication.body
  FROM public.creation_dedications dedication
  WHERE dedication.creation_id = p_source_creation_id;

  RETURN QUERY SELECT
    v_new_creation_id,
    v_new_job_id,
    false,
    v_session_count + 1;
END;
$function$;
  $fork_ddl$;
  REVOKE ALL ON FUNCTION public.read_preview_version_group(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION public.read_preview_version_group(uuid,text,uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid) TO service_role;
  PERFORM pg_catalog.pg_notify('pgrst','reload schema');
END;
$migration$;
