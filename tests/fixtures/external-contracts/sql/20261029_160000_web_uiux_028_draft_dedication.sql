-- WEB-UIUX-001/28 S3. NOT APPLIED; exact reviewed GO required.
-- Patch only the inherited CRLF body; no normalization or alternate baseline.
DO $web28_s3$
DECLARE r jsonb := '{"identity":"public.dedication_save_creation(uuid,text,uuid,bigint,text,text)","before_sha256":"5ae2add5b6c6d33b91e2ddd0683d99c29e4f7b9d68c7c243113d633f22ffbe74","after_sha256":"530cd453dd5b97749b89f3c9a193d8110ecee6d256d145fb983ac1504d1933dc","before_md5":"d9f0ea7a43b0b2930025fa96d7b4a50b","after_md5":"b65d0df9d0cc2a5fc0ea2b8ae14b9a1a","remove":"    -- Lock related unpaid orders before the creation. Session-lock writers\r\n    -- also lock an order row, so an edit and Checkout serialize on that row.\r\n    PERFORM o.order_id FROM public.orders o\r\n      WHERE o.order_status::text = ''unpaid'' AND EXISTS (\r\n        SELECT 1 FROM public.cart_items ci\r\n        WHERE ci.order_id = o.order_id AND ci.creation_id = p_creation_id\r\n          AND ci.status::text = ''ordered''\r\n      ) ORDER BY o.order_id FOR UPDATE OF o;\r\n    IF EXISTS (\r\n      SELECT 1 FROM public.orders o WHERE o.order_status::text = ''unpaid''\r\n        AND o.checkout_session_id IS NOT NULL AND EXISTS (\r\n          SELECT 1 FROM public.cart_items ci\r\n          WHERE ci.order_id = o.order_id AND ci.creation_id = p_creation_id\r\n            AND ci.status::text = ''ordered''\r\n        )\r\n    ) THEN\r\n      RAISE EXCEPTION ''Active checkout must be cancelled before editing dedication''\r\n        USING ERRCODE = ''55000'';\r\n    END IF;\r\n"}'; p record; updated record; body text; definition text; before_catalog jsonb;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r->>'identity');
 IF NOT FOUND OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>r->>'before_sha256'
 OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prokind<>'f' OR NOT p.prosecdef
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
 OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
  RAISE EXCEPTION 'web28_s3_source_drift';
 END IF;
 before_catalog := to_jsonb(p)-'prosrc';
 IF (length(p.prosrc)-length(replace(p.prosrc,r->>'remove','')))/length(r->>'remove')<>1 THEN
  RAISE EXCEPTION 'web28_s3_patch_count_drift';
 END IF;
 body := replace(p.prosrc,r->>'remove','');
 IF encode(sha256(convert_to(body,'UTF8')),'hex')<>r->>'after_sha256' THEN
  RAISE EXCEPTION 'web28_s3_target_drift';
 END IF;
 definition := pg_get_functiondef(p.oid);
 IF (length(definition)-length(replace(definition,p.prosrc,'')))/length(p.prosrc)<>1 THEN
  RAISE EXCEPTION 'web28_s3_definition_drift';
 END IF;
 EXECUTE replace(definition,p.prosrc,body);
 SELECT * INTO updated FROM pg_proc WHERE oid=p.oid;
 IF (to_jsonb(updated)-'prosrc') IS DISTINCT FROM before_catalog
 OR encode(sha256(convert_to(updated.prosrc,'UTF8')),'hex')<>r->>'after_sha256' THEN
  RAISE EXCEPTION 'web28_s3_postcondition_failed';
 END IF;
END $web28_s3$;
