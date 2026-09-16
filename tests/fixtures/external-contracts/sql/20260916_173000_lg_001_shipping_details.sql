-- LG-001: supplemental shipping history; existing order enums/stages unchanged.
-- One statement: do not rely on SQL Editor preserving a multi-statement BEGIN.
DO $lg_001_migration$
BEGIN
  IF pg_catalog.to_regclass('public.orders') IS NULL
     OR pg_catalog.to_regclass('public.order_status_events') IS NULL THEN
    RAISE EXCEPTION 'LG-001 requires existing orders and status audit';
  END IF;
  IF pg_catalog.to_regclass('public.order_shipping_details') IS NOT NULL THEN
    RAISE EXCEPTION 'LG-001 already exists; inspect catalog rather than rerun';
  END IF;
CREATE TABLE public.order_shipping_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(order_id) ON DELETE CASCADE,
  provider text CHECK (provider IS NULL OR provider = 'dealer_send'),
  tracking_number text,
  binding_version bigint NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 0,
  auto_delivery boolean NOT NULL DEFAULT false,
  last_attempt_at timestamptz,
  last_synced_at timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  sync_error_code text,
  delivery_status_event_id uuid REFERENCES public.order_status_events(status_event_id) ON DELETE SET NULL,
  delivery_notification_pending boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_until timestamptz
);
CREATE INDEX order_shipping_details_due ON public.order_shipping_details(next_sync_at)
  WHERE provider = 'dealer_send';

CREATE TABLE public.order_shipping_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
  binding_version bigint NOT NULL,
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 128),
  source text NOT NULL CHECK (source IN ('dealer_send', 'manual')),
  event_time text CHECK (length(event_time) <= 80), -- carrier local time, not assumed UTC
  country_code text CHECK (length(country_code) <= 2),
  status_code text CHECK (length(status_code) <= 500),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  carrier_id text CHECK (length(carrier_id) <= 500),
  carrier_api_type text CHECK (length(carrier_api_type) <= 500),
  changed_by_admin_id uuid REFERENCES public.customers(customer_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, binding_version, event_key)
);
CREATE INDEX order_shipping_events_history ON public.order_shipping_events
  (order_id, binding_version, created_at DESC);
ALTER TABLE public.order_shipping_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipping_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_shipping_details, public.order_shipping_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_shipping_details, public.order_shipping_events TO service_role;

CREATE FUNCTION public.lg_001_save_order_logistics(
  p_order_id uuid, p_admin_id uuid, p_expected_updated_at timestamptz, p_patch jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_state public.order_shipping_details%ROWTYPE;
  v_updated public.orders%ROWTYPE;
  v_status text; v_number text; v_carrier text; v_url text; v_note text;
  v_provider text; v_auto boolean; v_status_changed boolean; v_details_changed boolean;
  v_binding_changed boolean; v_event_id uuid; v_manual jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.order_status::text NOT IN ('paid','production','shipped','delivered') THEN
    RAISE EXCEPTION 'Order status is read-only';
  END IF;
  IF v_order.logistics_updated_at IS DISTINCT FROM p_expected_updated_at
     OR v_order.order_status::text IS DISTINCT FROM (p_patch->>'expectedStatus') THEN
    RAISE EXCEPTION 'Order changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.order_shipping_details(order_id, tracking_number)
    VALUES (p_order_id, v_order.tracking_number) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.order_shipping_details WHERE order_id = p_order_id FOR UPDATE;
  IF p_patch ? 'expectedRevision' AND v_state.revision <> (p_patch->>'expectedRevision')::bigint THEN
    RAISE EXCEPTION 'Shipping settings changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  v_status := COALESCE(p_patch->>'orderStatus', v_order.order_status::text);
  IF v_status NOT IN ('paid','production','shipped','delivered') THEN RAISE EXCEPTION 'Invalid order status'; END IF;
  v_number := CASE WHEN p_patch ? 'trackingNumber' THEN NULLIF(btrim(p_patch->>'trackingNumber'),'') ELSE v_order.tracking_number END;
  v_carrier := CASE WHEN p_patch ? 'trackingCarrier' THEN NULLIF(btrim(p_patch->>'trackingCarrier'),'') ELSE v_order.tracking_carrier END;
  v_url := CASE WHEN p_patch ? 'trackingUrl' THEN NULLIF(btrim(p_patch->>'trackingUrl'),'') ELSE v_order.tracking_url END;
  v_note := CASE WHEN p_patch ? 'logisticsNote' THEN NULLIF(btrim(p_patch->>'logisticsNote'),'') ELSE v_order.logistics_note END;
  v_provider := CASE WHEN p_patch ? 'provider' THEN NULLIF(p_patch->>'provider','') ELSE v_state.provider END;
  v_auto := CASE WHEN p_patch ? 'autoDelivery' THEN (p_patch->>'autoDelivery')::boolean ELSE v_state.auto_delivery END;
  IF v_provider IS NOT NULL AND v_provider <> 'dealer_send' THEN RAISE EXCEPTION 'Invalid provider'; END IF;
  IF v_provider IS NOT NULL AND v_number IS NULL THEN RAISE EXCEPTION 'Tracking number required'; END IF;
  IF length(v_number) > 100 OR length(v_carrier) > 500 OR length(v_url) > 2048 OR length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Logistics fields exceed limits';
  END IF;
  IF v_url IS NOT NULL AND v_url !~ '^https?://' THEN RAISE EXCEPTION 'Invalid tracking URL'; END IF;
  v_status_changed := v_order.order_status::text <> v_status;
  v_details_changed := ROW(v_number,v_carrier,v_url,v_note) IS DISTINCT FROM
    ROW(v_order.tracking_number,v_order.tracking_carrier,v_order.tracking_url,v_order.logistics_note);
  v_binding_changed := ROW(v_number,v_carrier,v_provider) IS DISTINCT FROM
    ROW(v_state.tracking_number,v_order.tracking_carrier,v_state.provider);
  -- Status corrections and new bindings pause automation; resume explicitly afterwards.
  IF v_status_changed OR v_binding_changed OR v_provider IS NULL THEN v_auto := false; END IF;
  UPDATE public.order_shipping_details SET
    provider = v_provider, tracking_number = v_number,
    revision = revision + 1,
    binding_version = binding_version + CASE WHEN v_binding_changed THEN 1 ELSE 0 END,
    auto_delivery = COALESCE(v_auto,false), lease_token = NULL, lease_until = NULL,
    delivery_notification_pending = CASE WHEN v_status_changed THEN false ELSE delivery_notification_pending END,
    last_attempt_at = CASE WHEN v_binding_changed THEN NULL ELSE last_attempt_at END,
    last_synced_at = CASE WHEN v_binding_changed THEN NULL ELSE last_synced_at END,
    failure_count = CASE WHEN v_binding_changed THEN 0 ELSE failure_count END,
    sync_error_code = CASE WHEN v_binding_changed THEN NULL ELSE sync_error_code END,
    next_sync_at = clock_timestamp()
    WHERE order_id = p_order_id RETURNING * INTO v_state;
  -- Existing orders triggers (including Signature Voice readiness) remain active.
  UPDATE public.orders SET order_status = v_status::public.order_status_enum,
    tracking_number = v_number, tracking_carrier = v_carrier, tracking_url = v_url,
    logistics_note = v_note,
    shipped_at = CASE WHEN v_status = 'shipped' THEN COALESCE(shipped_at,clock_timestamp()) ELSE shipped_at END,
    delivered_at = CASE WHEN v_status = 'delivered' THEN COALESCE(delivered_at,clock_timestamp()) ELSE delivered_at END,
    logistics_updated_at = clock_timestamp()
    WHERE order_id = p_order_id RETURNING * INTO v_updated;
  INSERT INTO public.order_status_events(order_id,previous_status,new_status,tracking_number,tracking_carrier,tracking_url,note,changed_by_admin_id)
    VALUES(p_order_id,v_order.order_status,v_updated.order_status,v_number,v_carrier,v_url,v_note,p_admin_id)
    RETURNING status_event_id INTO v_event_id;
  v_manual := p_patch->'manualEvent';
  IF v_manual IS NOT NULL AND v_manual <> 'null'::jsonb THEN
    IF length(btrim(v_manual->>'description')) NOT BETWEEN 1 AND 500
       OR v_manual->>'description' IS NULL THEN RAISE EXCEPTION 'Manual update description required'; END IF;
    INSERT INTO public.order_shipping_events(order_id,binding_version,event_key,source,event_time,country_code,description,changed_by_admin_id)
      VALUES(p_order_id,v_state.binding_version,v_manual->>'key','manual',v_manual->>'time',v_manual->>'country',btrim(v_manual->>'description'),p_admin_id)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('order',to_jsonb(v_updated),'statusEventId',v_event_id,
    'previousStatus',v_order.order_status,'statusChanged',v_status_changed,'trackingDetailsChanged',v_details_changed);
END $$;

CREATE FUNCTION public.lg_001_claim_shipping_sync(p_order_id uuid, p_force boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order public.orders%ROWTYPE; v_state public.order_shipping_details%ROWTYPE; v_token uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_status::text NOT IN ('shipped','delivered') THEN RETURN NULL; END IF;
  IF NOT p_force AND v_order.order_status::text <> 'shipped' THEN RETURN NULL; END IF;
  SELECT * INTO v_state FROM public.order_shipping_details WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_state.provider <> 'dealer_send' OR v_state.provider IS NULL
     OR v_state.tracking_number IS NULL OR v_state.tracking_number IS DISTINCT FROM v_order.tracking_number
     OR v_state.lease_until > clock_timestamp()
     OR v_state.last_attempt_at > clock_timestamp() - interval '1 minute'
     OR (NOT p_force AND v_state.next_sync_at > clock_timestamp()) THEN RETURN NULL; END IF;
  v_token := gen_random_uuid();
  UPDATE public.order_shipping_details SET lease_token = v_token,
    lease_until = clock_timestamp() + interval '2 minutes', last_attempt_at = clock_timestamp(),
    next_sync_at = clock_timestamp() + interval '2 minutes' WHERE order_id = p_order_id;
  RETURN jsonb_build_object('token',v_token,'trackingNumber',v_state.tracking_number,
    'revision',v_state.revision,'bindingVersion',v_state.binding_version);
END $$;

CREATE FUNCTION public.lg_001_finish_shipping_sync(
  p_order_id uuid, p_token uuid, p_revision bigint, p_events jsonb,
  p_error_code text, p_delivered_key text, p_mapping_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE; v_state public.order_shipping_details%ROWTYPE;
  v_event jsonb; v_status_event uuid; v_delivered boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
  SELECT * INTO v_state FROM public.order_shipping_details WHERE order_id = p_order_id FOR UPDATE;
  IF v_state.lease_token IS DISTINCT FROM p_token OR p_token IS NULL
     OR v_state.lease_until <= clock_timestamp() OR v_state.revision <> p_revision
     OR v_state.tracking_number IS DISTINCT FROM v_order.tracking_number
     OR v_state.provider IS DISTINCT FROM 'dealer_send' THEN RETURN jsonb_build_object('stale',true); END IF;
  IF p_error_code IS NOT NULL THEN
    IF p_error_code NOT IN ('provider_unavailable','invalid_response','not_configured','database_rejected') THEN RAISE EXCEPTION 'Invalid safe error code'; END IF;
    UPDATE public.order_shipping_details SET failure_count = LEAST(failure_count+1,20),
      sync_error_code = p_error_code, lease_token = NULL, lease_until = NULL,
      next_sync_at = clock_timestamp() + make_interval(hours => LEAST(24,power(2,LEAST(failure_count,4))::integer))
      WHERE order_id = p_order_id;
    RETURN jsonb_build_object('synced',false);
  END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) > 200 THEN RAISE EXCEPTION 'Invalid bounded events'; END IF;
  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    INSERT INTO public.order_shipping_events(order_id,binding_version,event_key,source,event_time,country_code,status_code,description,carrier_id,carrier_api_type)
      VALUES(p_order_id,v_state.binding_version,v_event->>'key','dealer_send',v_event->>'time',v_event->>'country',v_event->>'status',
        v_event->>'description',v_event->>'carrierId',v_event->>'apiType') ON CONFLICT DO NOTHING;
  END LOOP;
  IF v_state.auto_delivery AND v_order.order_status::text = 'shipped'
     AND p_delivered_key IS NOT NULL AND length(btrim(p_mapping_reference)) BETWEEN 1 AND 500
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_events) e WHERE e->>'key' = p_delivered_key) THEN
    UPDATE public.orders SET order_status = 'delivered',
      delivered_at = COALESCE(delivered_at,clock_timestamp()), logistics_updated_at = clock_timestamp()
      WHERE order_id = p_order_id;
    INSERT INTO public.order_status_events(order_id,previous_status,new_status,tracking_number,tracking_carrier,tracking_url,note)
      VALUES(p_order_id,'shipped','delivered',v_order.tracking_number,v_order.tracking_carrier,v_order.tracking_url,
        'Dealer Send delivery confirmed. Mapping: ' || p_mapping_reference || '; event: ' || p_delivered_key)
      RETURNING status_event_id INTO v_status_event;
    v_delivered := true;
  END IF;
  UPDATE public.order_shipping_details SET last_synced_at = clock_timestamp(),
    failure_count = 0, sync_error_code = NULL, lease_token = NULL, lease_until = NULL,
    delivery_status_event_id = COALESCE(v_status_event,delivery_status_event_id),
    delivery_notification_pending = CASE WHEN v_delivered THEN true ELSE delivery_notification_pending END,
    next_sync_at = clock_timestamp() + interval '6 hours' WHERE order_id = p_order_id;
  RETURN jsonb_build_object('synced',true,'delivered',v_delivered,'statusEventId',v_status_event);
END $$;

REVOKE ALL ON FUNCTION public.lg_001_save_order_logistics(uuid,uuid,timestamptz,jsonb),
  public.lg_001_claim_shipping_sync(uuid,boolean),
  public.lg_001_finish_shipping_sync(uuid,uuid,bigint,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lg_001_save_order_logistics(uuid,uuid,timestamptz,jsonb),
  public.lg_001_claim_shipping_sync(uuid,boolean),
  public.lg_001_finish_shipping_sync(uuid,uuid,bigint,jsonb,text,text,text) TO service_role;
END $lg_001_migration$;
