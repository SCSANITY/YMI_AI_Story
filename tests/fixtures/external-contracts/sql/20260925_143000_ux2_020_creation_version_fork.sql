-- UX2-020: Change Photo creates a new durable Creation and Preview Job.
-- The source Creation is read and locked, but never updated. A same-session
-- advisory lock makes request retries idempotent and preserves the existing
-- three-version browser-session limit without a new state table.
DO $ux2_020_migration$
DECLARE
  v_existing_definition text;
BEGIN
  IF pg_catalog.to_regclass('public.creations') IS NULL
    OR pg_catalog.to_regclass('public.jobs') IS NULL
    OR pg_catalog.to_regclass('public.user_assets') IS NULL
    OR pg_catalog.to_regclass('public.creation_dedications') IS NULL
    OR pg_catalog.to_regprocedure(
      'public.create_preview_job(text,uuid,uuid,text,jsonb,text,text,jsonb,jsonb,text,text,uuid,numeric,text,text,text,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'UX2-020 requires the current Creation, Preview, asset, and dedication contracts';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'create_preview_job'
        AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
          'p_owner_type text, p_anon_session_id uuid, p_customer_id uuid, p_template_id text, p_customize_snapshot jsonb, p_face_source_path text, p_config_url text, p_text_overrides jsonb, p_params jsonb, p_story_language text, p_selected_book_type text, p_voice_asset_id uuid, p_voice_sample_duration_seconds numeric, p_voice_consent_version text, p_voice_subject_name text, p_voice_subject_relationship text, p_voice_authorization_id uuid'
        AND procedure.prosecdef
        AND 'search_path=""' = ANY(COALESCE(procedure.proconfig, ARRAY[]::text[]))
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.create_preview_job(text,uuid,uuid,text,jsonb,text,text,jsonb,jsonb,text,text,uuid,numeric,text,text,text,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.create_preview_job(text,uuid,uuid,text,jsonb,text,text,jsonb,jsonb,text,text,uuid,numeric,text,text,text,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.create_preview_job(text,uuid,uuid,text,jsonb,text,text,jsonb,jsonb,text,text,uuid,numeric,text,text,text,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'UX2-020 requires the reviewed service-only create_preview_job contract';
  END IF;

  IF pg_catalog.to_regprocedure(
      'public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)'
    ) IS NOT NULL THEN
    SELECT pg_catalog.pg_get_functiondef(
      'public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure
    ) INTO v_existing_definition;

    IF position('creation_version_fork' IN v_existing_definition) = 0
      OR position('pg_advisory_xact_lock' IN v_existing_definition) = 0
      OR position('creation_dedications' IN v_existing_definition) = 0
    THEN
      RAISE EXCEPTION 'UX2-020 found an unreviewed fork_preview_creation_version function';
    END IF;
  END IF;

  EXECUTE $ddl$
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

      -- Serialize every Change Photo request in one browser experiment session.
      -- This makes same-request retries idempotent and the version cap exact.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_variant_session_id::text, 0)
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
        RAISE EXCEPTION 'preview_version_source_conflict' USING ERRCODE = '40001';
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
        AND job.input_snapshot->'creation_version_fork'->>'session_id' =
          p_variant_session_id::text
        AND job.input_snapshot->'creation_version_fork'->>'request_id' =
          p_request_id::text
      ORDER BY job.created_at
      LIMIT 1;

      SELECT pg_catalog.count(*)::integer
      INTO v_session_count
      FROM public.jobs job
      WHERE job.owner_type::text = p_owner_type
        AND (
          (p_owner_type = 'customer' AND job.customer_id = p_owner_id)
          OR (p_owner_type = 'anon' AND job.anon_session_id = p_owner_id)
        )
        AND job.job_type = 'preview'::public.job_type
        AND job.input_snapshot->'creation_version_fork'->>'kind' = 'change_photo'
        AND job.input_snapshot->'creation_version_fork'->>'session_id' =
          p_variant_session_id::text;

      IF v_existing_job.job_id IS NOT NULL THEN
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
  $ddl$;

  REVOKE ALL ON FUNCTION public.fork_preview_creation_version(
    uuid, uuid, text, uuid, uuid, uuid, uuid
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fork_preview_creation_version(
    uuid, uuid, text, uuid, uuid, uuid, uuid
  ) TO service_role;

  PERFORM pg_catalog.pg_notify('pgrst', 'reload schema');
END;
$ux2_020_migration$;
