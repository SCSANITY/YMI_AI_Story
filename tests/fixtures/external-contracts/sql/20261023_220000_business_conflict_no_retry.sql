-- SUPABASE-CPU-001. Frozen catalog from 2026-10-23T14:03:29Z.
-- Only business-conflict SQLSTATE40001 -> PT409; no business rows or guards changed.
-- Existing stuck PostgREST requests must be handled separately by the reviewed stop step.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $cpu_repair$
DECLARE
  frozen_records jsonb := '[{"identity":"public.attest_signature_voice_hardware_loaded(uuid,uuid,uuid,uuid,text,uuid)","before_sha256":"966f336c66d9678b5e97612ea3d3512269c4190d56408ed5a3ae01a10e07cee7","after_sha256":"c7bffdd53f343f4a81927061007508d55ea89aca5cb4f72071c9cf30d5e87125","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.claim_general_mail_send(uuid,timestamp with time zone,uuid,integer)","before_sha256":"3005d83d7718c5d499b400a94eae13d568769124d59c101e8d8bde341417048c","after_sha256":"24e128372f699ede07eb3f995d8bfea337a1f56e4fb323592661b45a0a2931c6","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.commit_final_print_artifact(uuid,uuid,bigint,text,uuid)","before_sha256":"88c79eaeb1908242818cdf3200504ec1db545123d028c9e2af0b4a960157ba5a","after_sha256":"9ba924054d500f6f15701403e479de94e5bc861a7017a8b6dcdbc586d2e57399","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.commit_signature_voice_narration_track(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,bigint,numeric,text,text)","before_sha256":"171e1df4fccdc632d17bfc46ec697306fbe6f26d9c3ad2e16c60d465f90de39e","after_sha256":"e140f6e573a7686b55fb7d560ae0b2af3c75c0c5f635fa4983c63735dfeefc5c","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.create_general_mail_attachment_upload(uuid,uuid,timestamp with time zone,uuid,text,text,text,bigint,text)","before_sha256":"5fbabbdcc8840c11341b574a2f8ab12306463becda4122b1c1cd993ae95c1d53","after_sha256":"5c1811fee7da89da39daa018d5ac779733c2cd3ee63df4dbb816c601b1d884bd","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.dedication_save_creation(uuid,text,uuid,bigint,text,text)","before_sha256":"e2d2915bfcc2a11384828424ac65e1e7a73b3789da0d701b692605d32817564a","after_sha256":"5ae2add5b6c6d33b91e2ddd0683d99c29e4f7b9d68c7c243113d633f22ffbe74","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.delete_general_mail_draft(uuid,timestamp with time zone,uuid)","before_sha256":"389fc55922637475f84e557d6ee3f58f6b47d35d192c3639db65337d8c2bc542","after_sha256":"b87d59588dd568f49e673d1142b64658819b2087527ba8a3b486bd6dbec4d637","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.finish_general_mail_attachment_cleanup(uuid,uuid)","before_sha256":"ad14948fc0a0cb2a354e8677da26dc52f7dc0f6a4a221edb5d23df4d42c8f4fc","after_sha256":"fb2253f551f0cd1d4ffff092bfd50d31e82e6a2708d2bb278e811ef4d901e1bb","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.fork_preview_creation_version(uuid,uuid,text,uuid,uuid,uuid,uuid)","before_sha256":"6aecedf5f9447312cac688fdc88be0afe28221755dc49b8f9330978839c0b699","after_sha256":"a33f98ed82c88dba59e5d1ee821d80a705fb1666a2b2bc8f3955a577b8798021","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.lg_001_save_order_logistics(uuid,uuid,timestamp with time zone,jsonb)","before_sha256":"3fa03a2758eb87cf43cf8bcef1845c12f0e5e4c8bd6f7abbac678919e7e2af35","after_sha256":"9f23a897d3dca42704ce22d1ccf61f76e6f7c09c3111feb10a52e21baabb46d3","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.mark_signature_voice_shipment_integrity(uuid,uuid,uuid,uuid,text,uuid)","before_sha256":"fda3eb639eb611da5a5f7764a6fd18892667d0f5323b6697899cb5e6a9078031","after_sha256":"159ba607b52cc2ac19092cbb8c3cfaeef00495843e02a1f562b302c08342feef","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.materials_assert_print_revision(uuid,bigint,boolean)","before_sha256":"6eb8cb8ceb6ef4d8a4b7381dd7476f1a149b0ece77322b6f8870457856a09424","after_sha256":"ef35a42cddb53f5a8fc90dee4131c646580c09669897e7d4213b034b0718e077","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.materials_save_dedication(uuid,uuid,uuid,text,bigint,text)","before_sha256":"c18a6fb62200c959218574b1237ac36160a5def26053695bb9f6b3db199ec8ce","after_sha256":"bc4342ea8eb46b009b690f093dc5dda5cb29e534dd8b3e6abfb523b24bfc810a","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.publish_legal_document_draft(text,uuid,integer,uuid,uuid)","before_sha256":"a0b1a541654bedb3ea5ea1d1c25af502ee873d506dd45595ffdbc065f3c95fc0","after_sha256":"356419442172f95a6269599afe14711fda07a04708054414ddf4fd0efbdc3969","replacements":3,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=public"]}},{"identity":"public.release_final_print_artifact(uuid,uuid,uuid)","before_sha256":"fe9e97f641ace924be171332d2d03718900f1e31aa257b29d78bbac0fa2486aa","after_sha256":"cf2ce52b8b7404175fcc1158274d005a94ed6f8b8ef04e4594447f916be7cf8b","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.replace_signature_voice_source(uuid,uuid,uuid,uuid,uuid,uuid,text,text,bigint,numeric,text,text,text,text,text,text)","before_sha256":"ea32539ec9734e41b49a3664bc6f8ebb1381b8eb02ac118032fbd6e238e9083c","after_sha256":"8568c4eb8af14e739de7a9684afea8f23cf2e900104f458c9fcf719e6b89f130","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.rollback_legal_document_revision(text,uuid,uuid,uuid)","before_sha256":"75c9e7383e5713e01e4e672702f0dd3d4510b72acd9122f7520c92c671529bc0","after_sha256":"9a0aa69f7c83884bc47d8c37c221ae2d08e84983a2f3383319d1045a2ec6a6a0","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=public"]}},{"identity":"public.rotate_kol_collaboration_code(uuid,uuid,uuid,timestamp with time zone,text,text,numeric,timestamp with time zone,integer,integer)","before_sha256":"fae11fe5a813dde41a0a60d094bab431f17327fce07f38b3027b069137ba6e66","after_sha256":"4df888d061ddfd6f1d712c389dd3bb66292d46f3b9de71eff3412c8eddf11d5e","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=public, pg_temp"]}},{"identity":"public.save_legal_document_draft(text,jsonb,uuid,integer,uuid,uuid)","before_sha256":"1e2d41850cb27591dc4e950b42a4f4ac4e82f6b4690910e4c0b44d1b8ec19049","after_sha256":"de1e8eab77043a087b131207cdc94267b98c6b481756b4f6cd74c4bffa9d5bb3","replacements":4,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=public"]}},{"identity":"public.set_signature_voice_source_triage(uuid,uuid,uuid,uuid,timestamp with time zone,text,text,text,text)","before_sha256":"dc8a7e7dfc0bd3d8d9bf81812e5638d9c206f02d9023569f08b997f9ebd381d3","after_sha256":"7b779d8dcd05d434857ef82384ae9459a4eae690285bb8d84b7fce3e35a31119","replacements":2,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.update_general_mail_draft(uuid,timestamp with time zone,uuid,text[],text[],text[],text,text)","before_sha256":"874a37a1101f82be89da203746feba3ecf7cdb43e3de5959e1cf179b0f54c651","after_sha256":"6ef9f20f6dc5075846ba8d558c5f7c1b5a245022acd909ca33ffe73799a49ad1","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.update_general_mail_rich_draft(uuid,timestamp with time zone,uuid,text[],text[],text[],text,text,text,jsonb)","before_sha256":"e7872606d505eb73a1805f099ef48e7c231a796d8743186886d96319f5fa1526","after_sha256":"0e1dd337e12c7cebf347eb8b0280735ff36a3d1cea22a5fa04a959367e414055","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=\"\""]}},{"identity":"public.update_kol_collaboration_code(uuid,uuid,uuid,timestamp with time zone,text,numeric,timestamp with time zone,integer,integer,boolean)","before_sha256":"ee0d4bd3ea34d09616aea8e4b1bca8fada5380eca1d8f7221f9e48a451c2ef80","after_sha256":"149c49c7869ca0f4e3b61e456fc758665f2cbf879b6e8caa5bffc9ee1239131f","replacements":1,"catalog":{"proowner":"16384","proacl":["postgres=X/postgres","service_role=X/postgres"],"prosecdef":true,"proconfig":["search_path=public, pg_temp"]}}]'::jsonb;
  target record;
  before_row record;
  after_row record;
  body_after text;
  definition_before text;
  others_before jsonb;
  others_after jsonb;
  touched integer := 0;
BEGIN
  -- Validate all frozen targets before the first replacement; any drift rolls back.
  FOR target IN
WITH frozen AS (SELECT * FROM jsonb_to_recordset(frozen_records) AS f(identity text,before_sha256 text,after_sha256 text,replacements integer,catalog jsonb))
  SELECT * FROM frozen ORDER BY identity
  LOOP
    SELECT p.*,jsonb_build_object('proowner',p.proowner,'proacl',p.proacl,
      'prosecdef',p.prosecdef,'proconfig',p.proconfig) AS custody
      INTO before_row FROM pg_proc p WHERE p.oid=to_regprocedure(target.identity);
    IF NOT FOUND OR before_row.prokind<>'f' OR before_row.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR encode(sha256(convert_to(before_row.prosrc,'UTF8')),'hex') IS DISTINCT FROM target.before_sha256
      OR before_row.custody IS DISTINCT FROM target.catalog THEN
      RAISE EXCEPTION 'cpu_repair_frozen_function_drift: %',target.identity;
    END IF;
    body_after := regexp_replace(before_row.prosrc,$cpu_pattern$(\merrcode\s*=\s*)'40001'$cpu_pattern$,$cpu_replacement$\1'PT409'$cpu_replacement$,'gi');
    IF before_row.prosrc LIKE '%PT409%' OR body_after LIKE '%40001%'
      OR (length(before_row.prosrc)-length(replace(before_row.prosrc,'40001','')))/5<>target.replacements
      OR encode(sha256(convert_to(body_after,'UTF8')),'hex') IS DISTINCT FROM target.after_sha256 THEN
      RAISE EXCEPTION 'cpu_repair_transform_mismatch: %',target.identity;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc LIKE '%40001%')<>23 THEN
    RAISE EXCEPTION 'cpu_repair_unexpected_40001_inventory';
  END IF;
WITH frozen AS (SELECT * FROM jsonb_to_recordset(frozen_records) AS f(identity text,before_sha256 text,after_sha256 text,replacements integer,catalog jsonb))
  SELECT jsonb_object_agg(p.oid::text,to_jsonb(p)) INTO others_before
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM frozen f WHERE to_regprocedure(f.identity)=p.oid);
  FOR target IN
WITH frozen AS (SELECT * FROM jsonb_to_recordset(frozen_records) AS f(identity text,before_sha256 text,after_sha256 text,replacements integer,catalog jsonb))
  SELECT * FROM frozen ORDER BY identity
  LOOP
    SELECT p.*,to_jsonb(p)-'prosrc' AS metadata INTO before_row
      FROM pg_proc p WHERE p.oid=to_regprocedure(target.identity);
    body_after := regexp_replace(before_row.prosrc,$cpu_pattern$(\merrcode\s*=\s*)'40001'$cpu_pattern$,$cpu_replacement$\1'PT409'$cpu_replacement$,'gi');
    definition_before := pg_get_functiondef(before_row.oid);
    -- Preserve original body bytes/line endings; avoid reformatting whole functions.
    IF strpos(definition_before,before_row.prosrc)=0 THEN
      RAISE EXCEPTION 'cpu_repair_body_not_in_definition: %',target.identity;
    END IF;
    EXECUTE replace(definition_before,before_row.prosrc,body_after);
    SELECT p.*,to_jsonb(p)-'prosrc' AS metadata INTO after_row
      FROM pg_proc p WHERE p.oid=before_row.oid;
    IF after_row.metadata IS DISTINCT FROM before_row.metadata
      OR encode(sha256(convert_to(after_row.prosrc,'UTF8')),'hex') IS DISTINCT FROM target.after_sha256 THEN
      RAISE EXCEPTION 'cpu_repair_postcondition_failed: %',target.identity;
    END IF;
    touched := touched+1;
  END LOOP;
WITH frozen AS (SELECT * FROM jsonb_to_recordset(frozen_records) AS f(identity text,before_sha256 text,after_sha256 text,replacements integer,catalog jsonb))
  SELECT jsonb_object_agg(p.oid::text,to_jsonb(p)) INTO others_after
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM frozen f WHERE to_regprocedure(f.identity)=p.oid);
  IF touched<>23 OR others_before IS DISTINCT FROM others_after THEN
    RAISE EXCEPTION 'cpu_repair_unrelated_function_drift';
  END IF;
END;
$cpu_repair$;
COMMIT;
