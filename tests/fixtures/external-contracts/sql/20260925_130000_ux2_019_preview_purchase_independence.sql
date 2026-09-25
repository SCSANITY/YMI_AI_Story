-- UX2-019: let the original durable Preview identity enter cart/checkout while
-- its images are still queued or running. Change-photo alternatives still
-- require a generated cover. No business row is changed by this migration.
DO $ux2_019_migration$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.commit_preview_variant(uuid,uuid,uuid)') IS NULL
    OR to_regclass('public.creations') IS NULL
    OR to_regclass('public.jobs') IS NULL
    OR to_regclass('public.cart_items') IS NULL
    OR to_regclass('public.final_jobs') IS NULL
    OR to_regclass('public.preview_share_links') IS NULL
  THEN
    RAISE EXCEPTION 'UX2-019 requires the existing Preview variant commit contract';
  END IF;

  SELECT pg_get_functiondef('public.commit_preview_variant(uuid,uuid,uuid)'::regprocedure)
  INTO v_definition;

  IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'commit_preview_variant'
        AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
          'p_creation_id uuid, p_expected_preview_job_id uuid, p_selected_preview_job_id uuid'
        AND procedure.prosecdef
        AND procedure.prorettype = 'record'::regtype
    )
    OR position('preview_variant_commit' IN v_definition) = 0
    OR position('preview_variant_invalidated_at' IN v_definition) = 0
    OR position('preview_share_links' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'UX2-019 found an unreviewed Preview variant commit function';
  END IF;

  IF pg_catalog.has_function_privilege(
      'anon', 'public.commit_preview_variant(uuid,uuid,uuid)', 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated', 'public.commit_preview_variant(uuid,uuid,uuid)', 'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role', 'public.commit_preview_variant(uuid,uuid,uuid)', 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'UX2-019 requires service-only Preview variant commit access';
  END IF;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.commit_preview_variant(
      p_creation_id uuid,
      p_expected_preview_job_id uuid,
      p_selected_preview_job_id uuid
    )
    RETURNS TABLE (
      result text,
      active_preview_job_id uuid,
      discarded_job_count integer
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
      v_creation public.creations%rowtype;
      v_current_job public.jobs%rowtype;
      v_selected_job public.jobs%rowtype;
      v_variant_marker jsonb;
      v_face_storage_path text;
      v_cover_bucket text;
      v_cover_storage_path text;
      v_is_original_selection boolean := false;
      v_now timestamptz := pg_catalog.now();
      v_discarded integer := 0;
      v_updated integer := 0;
    BEGIN
      IF p_creation_id IS NULL
        OR p_expected_preview_job_id IS NULL
        OR p_selected_preview_job_id IS NULL THEN
        RETURN QUERY SELECT 'invalid_request'::text, NULL::uuid, 0;
        RETURN;
      END IF;

      SELECT *
      INTO v_creation
      FROM public.creations
      WHERE creation_id = p_creation_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::uuid, 0;
        RETURN;
      END IF;

      IF v_creation.preview_job_id IS NULL THEN
        RETURN QUERY SELECT 'not_ready'::text, NULL::uuid, 0;
        RETURN;
      END IF;

      SELECT *
      INTO v_current_job
      FROM public.jobs
      WHERE job_id = v_creation.preview_job_id
        AND creation_id = p_creation_id
        AND job_type = 'preview'::public.job_type
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_ready'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      -- A successful prior commit is the persistent photo lock. Retries are no-ops.
      IF v_creation.preview_job_id = p_selected_preview_job_id
        AND v_current_job.input_snapshot->'preview_variant_commit'->>'creation_id' = p_creation_id::text THEN
        RETURN QUERY SELECT 'idempotent'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      -- A stale tab cannot replace the selection chosen by the winning session.
      IF v_creation.preview_job_id IS DISTINCT FROM p_expected_preview_job_id THEN
        RETURN QUERY SELECT 'conflict'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      IF v_current_job.input_snapshot->'preview_variant_commit'->>'creation_id' = p_creation_id::text THEN
        RETURN QUERY SELECT 'locked'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.cart_items WHERE creation_id = p_creation_id
      ) OR EXISTS (
        SELECT 1 FROM public.final_jobs WHERE creation_id = p_creation_id
      ) THEN
        RETURN QUERY SELECT 'locked'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      SELECT *
      INTO v_selected_job
      FROM public.jobs
      WHERE job_id = p_selected_preview_job_id
        AND creation_id = p_creation_id
        AND job_type = 'preview'::public.job_type
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid_candidate'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      IF v_selected_job.input_snapshot ? 'preview_variant_invalidated_at' THEN
        RETURN QUERY SELECT 'invalid_candidate'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      IF v_selected_job.owner_type IS DISTINCT FROM v_creation.owner_type
        OR v_selected_job.anon_session_id IS DISTINCT FROM v_creation.anon_session_id
        OR v_selected_job.customer_id IS DISTINCT FROM v_creation.customer_id THEN
        RETURN QUERY SELECT 'invalid_candidate'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      v_is_original_selection := p_selected_preview_job_id = v_creation.preview_job_id;

      IF v_selected_job.status IS NULL
        OR (
          v_is_original_selection
          AND v_selected_job.status NOT IN (
            'queued'::public.job_status,
            'running'::public.job_status,
            'done'::public.job_status
          )
        )
        OR (
          NOT v_is_original_selection
          AND v_selected_job.status NOT IN (
            'running'::public.job_status,
            'done'::public.job_status
          )
        ) THEN
        RETURN QUERY SELECT 'not_ready'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      v_variant_marker := v_selected_job.input_snapshot->'preview_variant';

      IF NOT v_is_original_selection THEN
        IF v_variant_marker->>'kind' IS DISTINCT FROM 'change_photo'
          OR v_variant_marker->>'base_preview_job_id' IS DISTINCT FROM p_expected_preview_job_id::text THEN
          RETURN QUERY SELECT 'invalid_candidate'::text, v_creation.preview_job_id, 0;
          RETURN;
        END IF;
        v_face_storage_path := nullif(v_variant_marker->>'face_storage_path', '');
      ELSE
        v_face_storage_path := coalesce(
          nullif(v_variant_marker->>'face_storage_path', ''),
          nullif(v_creation.customize_snapshot->>'storagePath', '')
        );
      END IF;

      IF v_face_storage_path IS NULL OR v_face_storage_path NOT LIKE 'user-assets/%' THEN
        RETURN QUERY SELECT 'invalid_candidate'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      SELECT coalesce(page->>'storage_path_full', page->>'storage_path')
      INTO v_cover_storage_path
      FROM pg_catalog.jsonb_array_elements(
        coalesce(v_selected_job.output_assets->'pages', '[]'::jsonb)
      ) AS page
      WHERE page->>'page_index' = '0'
      LIMIT 1;

      v_cover_storage_path := coalesce(
        nullif(v_cover_storage_path, ''),
        nullif(v_selected_job.output_assets->>'storage_path', '')
      );
      v_cover_bucket := coalesce(
        nullif(v_selected_job.output_assets->>'bucket', ''),
        'raw-private'
      );

      -- A queued/running original job may be selected before its cover exists.
      -- A completed original or any change-photo alternative still needs a cover.
      IF v_cover_storage_path IS NULL
        AND (NOT v_is_original_selection OR v_selected_job.status = 'done'::public.job_status) THEN
        RETURN QUERY SELECT 'not_ready'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      IF v_cover_storage_path IS NOT NULL THEN
        IF v_cover_bucket = 'app-templates' THEN
          v_cover_storage_path := pg_catalog.regexp_replace(
            v_cover_storage_path,
            '^/?app-templates/',
            ''
          );
        ELSE
          v_cover_storage_path := pg_catalog.regexp_replace(v_cover_storage_path, '^/+', '');
        END IF;
      END IF;

      UPDATE public.creations
      SET preview_job_id = p_selected_preview_job_id,
          customize_snapshot = pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              coalesce(customize_snapshot, '{}'::jsonb),
              '{storagePath}',
              pg_catalog.to_jsonb(v_face_storage_path),
              true
            ),
            '{previewJobId}',
            pg_catalog.to_jsonb(p_selected_preview_job_id::text),
            true
          ),
          updated_at = v_now
      WHERE creation_id = p_creation_id
        AND preview_job_id = p_expected_preview_job_id;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RETURN QUERY SELECT 'conflict'::text, v_creation.preview_job_id, 0;
        RETURN;
      END IF;

      UPDATE public.jobs
      SET input_snapshot = coalesce(input_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            'preview_variant_commit',
            pg_catalog.jsonb_build_object(
              'creation_id', p_creation_id::text,
              'committed_at', v_now,
              'expected_preview_job_id', p_expected_preview_job_id::text
            )
          ),
          updated_at = v_now
      WHERE job_id = p_selected_preview_job_id;

      IF v_cover_storage_path IS NOT NULL THEN
        UPDATE public.preview_share_links
        SET preview_job_id = p_selected_preview_job_id,
            cover_bucket = v_cover_bucket,
            cover_storage_path = v_cover_storage_path,
            updated_at = v_now
        WHERE creation_id = p_creation_id;
      END IF;

      UPDATE public.jobs
      SET status = CASE
            WHEN status = 'running'::public.job_status THEN 'cancel_requested'::public.job_status
            WHEN status IN ('queued'::public.job_status, 'done'::public.job_status)
              THEN 'cancelled'::public.job_status
            ELSE status
          END,
          error_message = CASE
            WHEN status IN (
              'queued'::public.job_status,
              'running'::public.job_status,
              'done'::public.job_status
            ) THEN 'Preview variant discarded after final selection'
            ELSE error_message
          END,
          input_snapshot = coalesce(input_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            'preview_variant_invalidated_at', v_now
          ),
          updated_at = v_now
      WHERE creation_id = p_creation_id
        AND job_type = 'preview'::public.job_type
        AND job_id <> p_selected_preview_job_id;

      GET DIAGNOSTICS v_discarded = ROW_COUNT;

      RETURN QUERY SELECT 'committed'::text, p_selected_preview_job_id, v_discarded;
    END;
    $function$;
  $ddl$;

  REVOKE ALL ON FUNCTION public.commit_preview_variant(uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.commit_preview_variant(uuid, uuid, uuid)
    TO service_role;
END;
$ux2_019_migration$;
