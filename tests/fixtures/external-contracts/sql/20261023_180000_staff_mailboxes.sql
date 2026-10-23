-- WEB-UIUX-001/16: Amy and Justin in the existing shared Admin General Inbox.
-- NOT APPLIED. Offline candidate; owner-authorized reviewed execution only.
-- One atomic DO, no row deletion/backfill, no new grants, no trigger changes.
DO $migration$
DECLARE
  v_item record;
  v_oid oid;
  v_source text;
  v_definition text;
  v_changed text;
  v_acl jsonb;
  v_after_acl jsonb;
  v_constraint text;
  v_count bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.general_mail_threads IN ACCESS EXCLUSIVE MODE;
  SELECT pg_get_constraintdef(oid,true) INTO v_constraint FROM pg_constraint
  WHERE conrelid='public.general_mail_threads'::regclass
    AND conname='general_mail_threads_mailbox_key_check' AND contype='c' AND convalidated;
  IF v_constraint IS DISTINCT FROM $legacy$CHECK (mailbox_key = ANY (ARRAY['admin'::text, 'hello'::text, 'security'::text, 'orders'::text, 'delivery'::text]))$legacy$ THEN
    RAISE EXCEPTION 'staff_mailboxes_constraint_drift';
  END IF;
  SELECT count(*) INTO v_count FROM public.general_mail_threads;
  FOR v_item IN SELECT * FROM (VALUES
      ('public.project_general_mail_inbound(uuid,text[])', '6352245efaafed31dd4f4df9cd98b854', '91974c04b180dc548adabbc3fc035739'),
      ('public.create_general_mail_draft(uuid,uuid,text,uuid,text,text[],text[],text[],text[],text,text,text,text)', '9d04744ee3c2042e9754e7854d9a3178', '1370486f1d9ad66ad024963d009093af'),
      ('public.get_general_mail_mailbox_counts()', '99e4066ba71b32a3655f903ba1a5e8fc', '8a6157d0ef63fcebbcec17f24c5b1ba3'),
      ('public.list_general_mail_thread_summaries(text,text,text,integer,integer)', 'c3e6387735b4ad64fc5d5935c4d30401', '3978d0e08eb36ecb3a69edc87c44d458'),
      ('public.create_general_mail_rich_draft(uuid,uuid,text,uuid,text,text[],text[],text[],text[],text,text,text,jsonb,text,text)', '55eff0774bb6e75f54bd0d41b12edfd4', '67f4a1ab86b9fd56af884abf1df2a1a9')
    ) AS expected(signature, before_hash, after_hash)
  LOOP
    v_oid := to_regprocedure(v_item.signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'staff_mailboxes_function_missing: %',v_item.signature; END IF;
    SELECT replace(prosrc,E'\r\n',E'\n'), pg_get_functiondef(oid),
      jsonb_build_object('acl',proacl,'owner',proowner,'security',prosecdef,'config',proconfig)
      INTO v_source,v_definition,v_acl FROM pg_proc WHERE oid=v_oid;
    IF md5(v_source) <> v_item.before_hash THEN
      RAISE EXCEPTION 'staff_mailboxes_function_drift: %',v_item.signature;
    END IF;
    IF NOT has_function_privilege('service_role',v_oid,'EXECUTE')
      OR has_function_privilege('anon',v_oid,'EXECUTE')
      OR has_function_privilege('authenticated',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'staff_mailboxes_acl_drift: %',v_item.signature;
    END IF;
    v_changed := v_definition;
    IF v_item.signature LIKE 'public.project_general_mail_inbound(%' THEN
      v_changed := replace(v_changed, $old$when 'delivery' then 'delivery'$old$,
        $new$when 'delivery' then 'delivery'
    when 'amy' then 'amy'
    when 'justin' then 'justin'$new$);
    ELSIF v_item.signature='public.get_general_mail_mailbox_counts()' THEN
      v_changed := replace(v_changed,$old$('delivery')$old$,$new$('delivery'), ('amy'), ('justin')$new$);
      v_changed := replace(v_changed,$old$'orders', 'delivery']$old$,$new$'orders', 'delivery', 'amy', 'justin']$new$);
    ELSE
      v_changed := replace(v_changed,$old$'orders', 'delivery')$old$,$new$'orders', 'delivery', 'amy', 'justin')$new$);
    END IF;
    IF v_changed=v_definition THEN RAISE EXCEPTION 'staff_mailboxes_patch_missing'; END IF;
    EXECUTE v_changed;
    SELECT jsonb_build_object('acl',proacl,'owner',proowner,'security',prosecdef,'config',proconfig)
      INTO v_after_acl FROM pg_proc WHERE oid=v_oid;
    IF v_after_acl IS DISTINCT FROM v_acl OR NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE oid=v_oid AND md5(replace(prosrc,E'\r\n',E'\n'))=v_item.after_hash
    ) THEN RAISE EXCEPTION 'staff_mailboxes_function_postcheck: %',v_item.signature; END IF;
  END LOOP;
  ALTER TABLE public.general_mail_threads DROP CONSTRAINT general_mail_threads_mailbox_key_check;
  ALTER TABLE public.general_mail_threads ADD CONSTRAINT general_mail_threads_mailbox_key_check
    CHECK (mailbox_key IN ('admin','hello','security','orders','delivery','amy','justin'));
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.general_mail_threads'::regclass
    AND conname='general_mail_threads_mailbox_key_check' AND convalidated)
    OR (SELECT count(*) FROM public.general_mail_threads) <> v_count THEN
    RAISE EXCEPTION 'staff_mailboxes_constraint_postcheck';
  END IF;
END;
$migration$;
