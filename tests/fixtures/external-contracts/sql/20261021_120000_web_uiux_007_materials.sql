-- WEB-UIUX-001/07-B. OFFLINE CANDIDATE: not applied.
-- Forward-only; deploy only with the completed 07-C chain and explicit T2 GO.
-- Existing orders require owner disposition, not compatibility/backfill/deletion.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.orders, public.cart_items, public.cart_item_dedications,
  public.creation_dedications IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders) THEN
    RAISE EXCEPTION 'materials_existing_orders_require_owner_disposition';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cart_item_dedications) THEN
    RAISE EXCEPTION 'materials_existing_lines_require_owner_disposition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.cart_item_dedications'::regclass
      AND tgname='dedication_snapshot_change_guard' AND tgenabled='O'
      AND tgfoid='public.dedication_guard_snapshot_change()'::regprocedure) THEN
    RAISE EXCEPTION 'materials_dedication_guard_drift';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.creations'::regclass
    AND tgenabled='O' AND NOT tgisinternal AND tgfoid IN
    ('public.enforce_creation_voice_binding()'::regprocedure,
     'public.enforce_creation_voice_authorization_v2()'::regprocedure))<>2
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.creations'::regclass
      AND contype='f' AND confdeltype='r' AND convalidated AND confrelid IN
      ('public.user_assets'::regclass,'public.signature_voice_capture_authorizations'::regclass))<>2 THEN
    RAISE EXCEPTION 'materials_voice_guard_or_restrict_drift';
  END IF;
END $preflight$;

ALTER TABLE public.orders ADD COLUMN paid_at timestamptz;
ALTER TABLE public.cart_item_dedications ADD COLUMN revision bigint NOT NULL DEFAULT 1
  CHECK (revision > 0);

CREATE TABLE public.order_dedication_revisions (
  cart_item_id uuid NOT NULL REFERENCES public.cart_items(cart_item_id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  decision text NOT NULL CHECK (decision IN ('skipped','confirmed')),
  body text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cart_item_id,revision),
  CHECK ((decision='skipped' AND body IS NULL) OR
    (decision='confirmed' AND body IS NOT NULL AND length(btrim(body,E' \t\n')) > 0
      AND length(body)<=300 AND position(E'\r' IN body)=0
      AND length(body)-length(replace(body,E'\n',''))<=8))
);
CREATE TABLE public.order_material_grants (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  item_ids uuid[] NOT NULL CHECK (cardinality(item_ids) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '7 days')
);
CREATE INDEX order_material_grants_order_idx ON public.order_material_grants(order_id);
CREATE TABLE public.order_material_recovery_challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  verification_id uuid NOT NULL UNIQUE REFERENCES public.verification_codes(verification_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.order_dedication_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_material_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_material_recovery_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_dedication_revisions, public.order_material_grants,
  public.order_material_recovery_challenges FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.order_dedication_revisions TO service_role;
-- All mutation/access is through explicitly granted server-only functions.

CREATE FUNCTION public.materials_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'materials_history_immutable'; END $$;
CREATE TRIGGER order_dedication_revisions_immutable BEFORE UPDATE OR DELETE
  ON public.order_dedication_revisions FOR EACH ROW
  EXECUTE FUNCTION public.materials_reject_history_mutation();

CREATE FUNCTION public.materials_paid_clock() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.paid_at IS NOT NULL OR NEW.payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'materials_order_must_start_unpaid';
    END IF;
  ELSE
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'materials_paid_clock_server_owned';
    END IF;
    IF NEW.payment_id IS NOT NULL AND NEW.order_status::text IN ('paid','production') THEN
      NEW.paid_at := coalesce(OLD.paid_at,clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_materials_paid_clock BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.materials_paid_clock();

-- Replace the guard's definition; the named trigger remains continuously enabled.
CREATE OR REPLACE FUNCTION public.dedication_guard_snapshot_change() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o public.orders%rowtype; i public.cart_items%rowtype;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'materials_line_delete_forbidden'; END IF;
  SELECT * INTO o FROM public.orders WHERE order_id=NEW.order_id FOR UPDATE;
  IF NOT FOUND OR o.paid_at IS NULL OR o.payment_id IS NULL
    OR o.order_status::text NOT IN ('paid','production') THEN
    RAISE EXCEPTION 'materials_paid_order_required';
  END IF;
  SELECT * INTO i FROM public.cart_items WHERE cart_item_id=NEW.cart_item_id;
  IF NOT FOUND OR i.order_id IS DISTINCT FROM NEW.order_id
    OR i.creation_id IS DISTINCT FROM NEW.creation_id OR i.status::text<>'ordered' THEN
    RAISE EXCEPTION 'materials_line_link_invalid';
  END IF;
  IF clock_timestamp()>=o.paid_at+interval '48 hours' THEN
    RAISE EXCEPTION 'materials_dedication_closed';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.cart_item_id,NEW.order_id,NEW.creation_id,NEW.source_revision,NEW.captured_at)
      IS DISTINCT FROM (OLD.cart_item_id,OLD.order_id,OLD.creation_id,OLD.source_revision,OLD.captured_at)
      OR NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION 'materials_revision_or_identity_invalid';
    END IF;
  ELSIF NEW.revision<>1 THEN RAISE EXCEPTION 'materials_initial_revision_invalid';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.materials_append_dedication_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.order_dedication_revisions(cart_item_id,revision,decision,body)
    VALUES (NEW.cart_item_id,NEW.revision,NEW.decision,NEW.body);
  RETURN NEW;
END $$;
CREATE TRIGGER dedication_material_revision AFTER INSERT OR UPDATE ON public.cart_item_dedications
  FOR EACH ROW EXECUTE FUNCTION public.materials_append_dedication_revision();

CREATE FUNCTION public.materials_initialize_paid_lines() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE order_id=NEW.order_id AND status::text='ordered') THEN
      RAISE EXCEPTION 'materials_order_lines_missing';
    END IF;
    INSERT INTO public.cart_item_dedications
      (cart_item_id,order_id,creation_id,decision,body,source_revision,revision)
    SELECT i.cart_item_id,i.order_id,i.creation_id,coalesce(d.decision,'skipped'),d.body,
      coalesce(d.revision,1),1
    FROM public.cart_items i LEFT JOIN public.creation_dedications d ON d.creation_id=i.creation_id
    WHERE i.order_id=NEW.order_id AND i.status::text='ordered';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_materials_initialize AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.materials_initialize_paid_lines();

-- A customer ID is supplied only by verified server authentication; a grant only
-- by the material credential adapter. Neither is accepted as a client identity.
CREATE FUNCTION public.materials_assert_access(p_order uuid,p_customer uuid,p_hash text,p_item uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%rowtype; g public.order_material_grants%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE order_id=p_order;
  IF NOT FOUND OR o.paid_at IS NULL OR o.payment_id IS NULL
    OR o.order_status::text NOT IN ('paid','production') THEN
    RAISE EXCEPTION 'materials_access_denied' USING ERRCODE='42501';
  END IF;
  IF p_customer IS NOT NULL AND p_hash IS NULL THEN
    IF o.customer_id IS DISTINCT FROM p_customer THEN
      RAISE EXCEPTION 'materials_access_denied' USING ERRCODE='42501';
    END IF;
  ELSIF p_customer IS NULL AND p_hash IS NOT NULL THEN
    SELECT * INTO g FROM public.order_material_grants WHERE token_hash=p_hash AND order_id=p_order;
    IF NOT FOUND OR g.completed_at IS NOT NULL OR g.expires_at<=clock_timestamp()
      OR (p_item IS NOT NULL AND NOT p_item=ANY(g.item_ids)) THEN
      RAISE EXCEPTION 'materials_access_denied' USING ERRCODE='42501';
    END IF;
  ELSE RAISE EXCEPTION 'materials_access_denied' USING ERRCODE='42501';
  END IF;
  IF p_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cart_items
    WHERE order_id=p_order AND cart_item_id=p_item AND status::text='ordered') THEN
    RAISE EXCEPTION 'materials_access_denied' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION public.materials_read(p_order uuid,p_customer uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.materials_assert_access(p_order,p_customer,p_hash);
  IF EXISTS(SELECT 1 FROM public.cart_items i LEFT JOIN public.cart_item_dedications d
    ON d.cart_item_id=i.cart_item_id WHERE i.order_id=p_order AND i.status::text='ordered'
      AND d.cart_item_id IS NULL) THEN RAISE EXCEPTION 'materials_lines_unavailable'; END IF;
  SELECT jsonb_build_object('order_id',o.order_id,'dedication_deadline',o.paid_at+interval '48 hours',
    'items',coalesce(jsonb_agg(jsonb_build_object('cart_item_id',i.cart_item_id,
      'creation_id',i.creation_id,'template_id',c.template_id,'package_type',i.package_type,
      'dedication',jsonb_build_object('body',d.body,'decision',d.decision,'revision',d.revision),
      'can_edit_dedication',clock_timestamp()<o.paid_at+interval '48 hours',
      'voice_ready',c.voice_asset_id IS NOT NULL,
      'can_submit_voice',i.package_type='supreme' AND c.voice_asset_id IS NULL)
      ORDER BY i.cart_item_id),'[]'::jsonb)) INTO result
  FROM public.orders o JOIN public.cart_items i ON i.order_id=o.order_id AND i.status::text='ordered'
  JOIN public.creations c ON c.creation_id=i.creation_id
  JOIN public.cart_item_dedications d ON d.cart_item_id=i.cart_item_id
  WHERE o.order_id=p_order AND (p_hash IS NULL OR i.cart_item_id=ANY(
    (SELECT item_ids FROM public.order_material_grants WHERE token_hash=p_hash)::uuid[]))
  GROUP BY o.order_id,o.paid_at;
  IF result IS NULL THEN RAISE EXCEPTION 'materials_lines_unavailable'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.materials_issue_grant(p_order uuid,p_hash text,p_items uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND OR o.paid_at IS NULL OR o.payment_id IS NULL
    OR o.order_status::text NOT IN ('paid','production') OR nullif(btrim(o.email),'') IS NULL
    OR p_items IS NULL OR cardinality(p_items) NOT BETWEEN 1 AND 100
    OR cardinality(p_items)<>(SELECT count(DISTINCT x) FROM unnest(p_items) x)
    OR EXISTS(SELECT 1 FROM unnest(p_items) x WHERE NOT EXISTS(SELECT 1 FROM public.cart_items i
      WHERE i.cart_item_id=x AND i.order_id=p_order AND i.status::text='ordered')) THEN
    RAISE EXCEPTION 'materials_grant_ineligible';
  END IF;
  INSERT INTO public.order_material_grants(token_hash,order_id,item_ids,created_at,expires_at)
    VALUES(p_hash,p_order,p_items,statement_timestamp(),statement_timestamp()+interval '7 days');
END $$;

CREATE FUNCTION public.materials_complete_grant(p_order uuid,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.orders WHERE order_id=p_order FOR UPDATE;
  PERFORM public.materials_assert_access(p_order,NULL,p_hash);
  UPDATE public.order_material_grants SET completed_at=clock_timestamp()
    WHERE order_id=p_order AND completed_at IS NULL;
END $$;

CREATE FUNCTION public.materials_save_dedication(p_order uuid,p_item uuid,p_customer uuid,
  p_hash text,p_expected bigint,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.cart_item_dedications%rowtype; normalized text; choice text;
BEGIN
  PERFORM 1 FROM public.orders WHERE order_id=p_order FOR UPDATE;
  PERFORM public.materials_assert_access(p_order,p_customer,p_hash,p_item);
  SELECT * INTO d FROM public.cart_item_dedications WHERE cart_item_id=p_item FOR UPDATE;
  IF NOT FOUND OR d.order_id<>p_order OR d.revision IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'materials_dedication_revision_conflict' USING ERRCODE='40001';
  END IF;
  IF clock_timestamp()>=(SELECT paid_at+interval '48 hours' FROM public.orders WHERE order_id=p_order) THEN
    RAISE EXCEPTION 'materials_dedication_closed';
  END IF;
  normalized:=nullif(btrim(replace(replace(coalesce(p_body,''),E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n'),'');
  choice:=CASE WHEN normalized IS NULL THEN 'skipped' ELSE 'confirmed' END;
  IF (d.decision,d.body) IS DISTINCT FROM (choice,normalized) THEN
    UPDATE public.cart_item_dedications SET decision=choice,body=normalized,revision=revision+1
      WHERE cart_item_id=p_item RETURNING * INTO d;
  END IF;
  RETURN jsonb_build_object('decision',d.decision,'body',d.body,'revision',d.revision);
END $$;

CREATE FUNCTION public.materials_bind_voice(p_order uuid,p_item uuid,p_customer uuid,p_hash text,
  p_asset uuid,p_authorization uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.creations%rowtype; a public.user_assets%rowtype;
  v_authorization public.signature_voice_capture_authorizations%rowtype; duration numeric;
BEGIN
  PERFORM 1 FROM public.orders WHERE order_id=p_order FOR UPDATE;
  PERFORM public.materials_assert_access(p_order,p_customer,p_hash,p_item);
  SELECT creation.* INTO c FROM public.creations creation JOIN public.cart_items i
    ON i.creation_id=creation.creation_id WHERE i.cart_item_id=p_item AND i.package_type='supreme'
    FOR UPDATE OF creation;
  IF NOT FOUND OR c.voice_asset_id IS NOT NULL THEN RAISE EXCEPTION 'materials_voice_not_unbound'; END IF;
  SELECT * INTO a FROM public.user_assets WHERE asset_id=p_asset FOR UPDATE;
  IF NOT FOUND OR a.asset_type::text IS DISTINCT FROM 'voice_sample' OR nullif(btrim(a.storage_path),'') IS NULL
    OR (a.owner_type,a.customer_id,a.anon_session_id) IS DISTINCT FROM (c.owner_type,c.customer_id,c.anon_session_id) THEN
    RAISE EXCEPTION 'materials_voice_asset_invalid';
  END IF;
  SELECT * INTO v_authorization FROM public.signature_voice_capture_authorizations
    WHERE authorization_id=p_authorization FOR UPDATE;
  IF NOT FOUND OR v_authorization.confirmed_at IS NULL OR v_authorization.confirmed_asset_id IS DISTINCT FROM p_asset
    OR v_authorization.consent_version IS DISTINCT FROM 'signature-voice-consent-v3'
    OR v_authorization.speaker_kind IS DISTINCT FROM 'authorized_speaker'
    OR (v_authorization.owner_type,v_authorization.customer_id,v_authorization.anon_session_id)
      IS DISTINCT FROM (c.owner_type,c.customer_id,c.anon_session_id) THEN
    RAISE EXCEPTION 'materials_voice_authorization_invalid';
  END IF;
  duration:=(a.metadata->>'duration_seconds')::numeric;
  IF duration IS NULL OR duration<=0 OR duration::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'materials_voice_duration_invalid';
  END IF;
  UPDATE public.creations SET voice_asset_id=p_asset,voice_sample_duration_seconds=duration,
    voice_consent_version=v_authorization.consent_version,voice_consent_accepted_at=v_authorization.accepted_at,
    voice_bound_at=clock_timestamp(),voice_subject_name='Authorized narrator',
    voice_subject_relationship='authorized_submitter',voice_capture_authorization_id=p_authorization,
    voice_speaker_kind=v_authorization.speaker_kind,updated_at=clock_timestamp()
    WHERE creation_id=c.creation_id AND voice_asset_id IS NULL;
  -- Existing Creation voice-binding/authorization/RESTRICT guards stay enabled.
END $$;

CREATE FUNCTION public.materials_begin_recovery(p_order uuid,p_verification uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE challenge uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.orders o JOIN public.verification_codes v
    ON lower(btrim(o.email))=v.email WHERE o.order_id=p_order AND v.verification_id=p_verification
      AND v.expires_at>clock_timestamp() AND o.paid_at IS NOT NULL AND o.payment_id IS NOT NULL
      AND o.order_status::text IN ('paid','production')) THEN
    RAISE EXCEPTION 'materials_recovery_ineligible';
  END IF;
  INSERT INTO public.order_material_recovery_challenges(order_id,verification_id)
    VALUES(p_order,p_verification) RETURNING challenge_id INTO challenge;
  RETURN challenge;
END $$;

CREATE FUNCTION public.materials_finish_recovery(p_order uuid,p_challenge uuid,p_code text,p_new_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text; verification uuid; items uuid[];
BEGIN
  PERFORM 1 FROM public.orders WHERE order_id=p_order FOR UPDATE;
  SELECT v.email,v.verification_id INTO v_email,verification
    FROM public.order_material_recovery_challenges r
    JOIN public.verification_codes v ON v.verification_id=r.verification_id
    JOIN public.orders o ON o.order_id=r.order_id AND lower(btrim(o.email))=v.email
    WHERE r.challenge_id=p_challenge AND r.order_id=p_order AND v.expires_at>clock_timestamp()
      AND o.paid_at IS NOT NULL AND o.order_status::text IN ('paid','production')
    FOR UPDATE OF v;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Verify that the existing OTP function will consume this exact challenge code.
  IF verification IS DISTINCT FROM (SELECT verification_id FROM public.verification_codes
    WHERE verification_codes.email=v_email AND expires_at>clock_timestamp()
    ORDER BY expires_at DESC,created_at DESC LIMIT 1) THEN RETURN false; END IF;
  IF NOT public.verify_guest_otp(v_email,p_code) THEN RETURN false; END IF;
  UPDATE public.order_material_grants SET completed_at=clock_timestamp()
    WHERE order_id=p_order AND completed_at IS NULL;
  SELECT array_agg(cart_item_id ORDER BY cart_item_id) INTO items FROM public.cart_items
    WHERE order_id=p_order AND status::text='ordered';
  PERFORM public.materials_issue_grant(p_order,p_new_hash,items);
  RETURN true;
END $$;

-- Explicit ACLs also override inherited/default service-role EXECUTE grants.
DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND (p.proname LIKE 'materials_%' OR p.proname='dedication_guard_snapshot_change') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.proname IN ('materials_read','materials_issue_grant','materials_complete_grant',
      'materials_save_dedication','materials_bind_voice','materials_begin_recovery','materials_finish_recovery') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    END IF;
  END LOOP;
END $acl$;
COMMIT;
