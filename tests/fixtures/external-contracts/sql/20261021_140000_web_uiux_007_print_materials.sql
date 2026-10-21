-- WEB-UIUX-001/07-C offline candidate; NOT APPLIED. Requires accepted07-B.
-- Adds material fencing around the existing manual-print functions; never
-- replaces or bypasses their artifact, Admin, PDF or Signature Voice checks.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.orders,public.cart_item_dedications,public.final_jobs,
  public.final_print_artifacts IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF to_regprocedure('public.materials_save_dedication(uuid,uuid,uuid,text,bigint,text)') IS NULL
    OR to_regprocedure('public.create_final_print_artifact(uuid,uuid,text,text,bigint,text,uuid)') IS NULL
    OR to_regprocedure('public.release_final_print_artifact(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'materials_print_dependencies_missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.final_print_artifacts) THEN
    RAISE EXCEPTION 'materials_existing_print_artifacts_require_owner_disposition';
  END IF;
END $preflight$;
ALTER TABLE public.final_print_artifacts ADD COLUMN dedication_revision bigint CHECK(dedication_revision>0);

CREATE FUNCTION public.materials_assert_print_revision(p_job uuid,p_revision bigint,p_release boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%rowtype; current_revision bigint;
BEGIN
  -- The very same row lock as materials_save_dedication. Hold it through the
  -- existing artifact commit/release transaction; no stale check outside a lock.
  SELECT orders.* INTO o FROM public.orders orders JOIN public.final_jobs f ON f.order_id=orders.order_id
    WHERE f.final_job_id=p_job FOR UPDATE OF orders;
  IF NOT FOUND OR o.paid_at IS NULL OR o.payment_id IS NULL
    OR o.order_status::text NOT IN ('paid','production') THEN
    RAISE EXCEPTION 'materials_print_paid_order_required';
  END IF;
  SELECT d.revision INTO current_revision FROM public.final_jobs f
    JOIN public.cart_items i ON i.cart_item_id=f.cart_item_id AND i.order_id=f.order_id AND i.creation_id=f.creation_id
    JOIN public.cart_item_dedications d ON d.cart_item_id=i.cart_item_id AND d.order_id=i.order_id
      AND d.creation_id=i.creation_id
    WHERE f.final_job_id=p_job AND i.status::text='ordered';
  IF current_revision IS NULL OR p_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'materials_print_dedication_revision_stale' USING ERRCODE='40001';
  END IF;
  IF p_release AND clock_timestamp()<o.paid_at+interval '48 hours' THEN
    RAISE EXCEPTION 'materials_print_dedication_window_open' USING ERRCODE='55000';
  END IF;
END $$;

CREATE FUNCTION public.materials_create_print_artifact(
  p_final_job_id uuid,p_artifact_id uuid,p_storage_path text,p_original_filename text,
  p_declared_size_bytes bigint,p_content_type text,p_admin_customer_id uuid,p_expected_dedication_revision bigint
) RETURNS TABLE(artifact_id uuid,storage_path text,artifact_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.materials_assert_print_revision(p_final_job_id,p_expected_dedication_revision,false);
  -- Existing function remains the authority for Admin, metadata and PDF state.
  RETURN QUERY SELECT * FROM public.create_final_print_artifact(p_final_job_id,p_artifact_id,
    p_storage_path,p_original_filename,p_declared_size_bytes,p_content_type,p_admin_customer_id);
  UPDATE public.final_print_artifacts a SET dedication_revision=p_expected_dedication_revision
    WHERE a.artifact_id=p_artifact_id AND a.final_job_id=p_final_job_id AND a.status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'materials_print_artifact_missing'; END IF;
END $$;

-- Historical Admin print review still reads effective materials after shipment.
-- This trusted read has no grant/customer entry and returns no receipt fields.
CREATE FUNCTION public.materials_read_trusted_lines(p_order uuid)
RETURNS TABLE(cart_item_id uuid,creation_id uuid,decision text,body text,revision bigint,dedication_deadline timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT i.cart_item_id,i.creation_id,d.decision,d.body,d.revision,o.paid_at+interval '48 hours'
  FROM public.orders o JOIN public.cart_items i ON i.order_id=o.order_id AND i.status::text='ordered'
  JOIN public.cart_item_dedications d ON d.cart_item_id=i.cart_item_id AND d.order_id=i.order_id AND d.creation_id=i.creation_id
  WHERE o.order_id=p_order AND o.paid_at IS NOT NULL AND o.payment_id IS NOT NULL
  ORDER BY i.cart_item_id;
$$;
REVOKE ALL ON FUNCTION public.materials_read_trusted_lines(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.materials_read_trusted_lines(uuid) TO service_role;

-- All application print writers take the order lock before the legacy job/
-- artifact locks. This also checks idempotent legacy early-return paths.
CREATE FUNCTION public.materials_commit_print_artifact(
  p_final_job_id uuid,p_artifact_id uuid,p_verified_size_bytes bigint,p_content_type text,p_admin_customer_id uuid
) RETURNS TABLE(artifact_id uuid,storage_path text,artifact_status text,verified_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE used_revision bigint;
BEGIN
  SELECT a.dedication_revision INTO used_revision FROM public.final_print_artifacts a
    WHERE a.artifact_id=p_artifact_id AND a.final_job_id=p_final_job_id;
  PERFORM public.materials_assert_print_revision(p_final_job_id,used_revision,false);
  RETURN QUERY SELECT * FROM public.commit_final_print_artifact(p_final_job_id,p_artifact_id,
    p_verified_size_bytes,p_content_type,p_admin_customer_id);
END $$;
CREATE FUNCTION public.materials_release_print_artifact(
  p_final_job_id uuid,p_expected_artifact_id uuid,p_admin_customer_id uuid
) RETURNS TABLE(release_result text,artifact_id uuid,storage_path text,released_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE used_revision bigint;
BEGIN
  SELECT a.dedication_revision INTO used_revision FROM public.final_print_artifacts a
    WHERE a.artifact_id=p_expected_artifact_id AND a.final_job_id=p_final_job_id;
  PERFORM public.materials_assert_print_revision(p_final_job_id,used_revision,true);
  RETURN QUERY SELECT * FROM public.release_final_print_artifact(p_final_job_id,p_expected_artifact_id,p_admin_customer_id);
END $$;

CREATE FUNCTION public.materials_fence_print_artifact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.dedication_revision IS NOT NULL
    AND NEW.dedication_revision IS DISTINCT FROM OLD.dedication_revision THEN
    RAISE EXCEPTION 'materials_print_revision_immutable';
  END IF;
  IF NEW.status IN ('verified','released') THEN
    PERFORM public.materials_assert_print_revision(NEW.final_job_id,NEW.dedication_revision,NEW.status='released');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER final_print_artifact_material_fence BEFORE INSERT OR UPDATE ON public.final_print_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.materials_fence_print_artifact();

-- Prevent old callers from preparing an unbound PDF through the old RPC. The
-- wrapper alone can invoke it; commit/release keep existing ACLs and bodies.
REVOKE ALL ON FUNCTION public.create_final_print_artifact(uuid,uuid,text,text,bigint,text,uuid),
  public.commit_final_print_artifact(uuid,uuid,bigint,text,uuid),
  public.release_final_print_artifact(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.materials_assert_print_revision(uuid,bigint,boolean),
  public.materials_fence_print_artifact(),
  public.materials_commit_print_artifact(uuid,uuid,bigint,text,uuid),
  public.materials_release_print_artifact(uuid,uuid,uuid),
  public.materials_create_print_artifact(uuid,uuid,text,text,bigint,text,uuid,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.materials_create_print_artifact(uuid,uuid,text,text,bigint,text,uuid,bigint),
  public.materials_commit_print_artifact(uuid,uuid,bigint,text,uuid),
  public.materials_release_print_artifact(uuid,uuid,uuid) TO service_role;
COMMIT;
