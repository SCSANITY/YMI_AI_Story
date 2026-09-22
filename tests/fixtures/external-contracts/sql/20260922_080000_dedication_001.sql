-- DEDICATION-001: private per-creation decision and per-order-line snapshot.
-- Draft source only until authorized live-catalog preflight and reviewed hash.
-- One statement so a SQL Editor failure rolls back the entire addition.
DO $dedication_001$
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  IF pg_catalog.to_regclass('public.creations') IS NULL
     OR pg_catalog.to_regclass('public.cart_items') IS NULL
     OR pg_catalog.to_regclass('public.orders') IS NULL
     OR pg_catalog.to_regclass('public.creation_dedications') IS NOT NULL
     OR pg_catalog.to_regclass('public.cart_item_dedications') IS NOT NULL THEN
    RAISE EXCEPTION 'DEDICATION-001 schema preflight mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.orders'::pg_catalog.regclass
      AND attname = 'checkout_session_id' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.cart_items'::pg_catalog.regclass
      AND attname = 'creation_id' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'DEDICATION-001 requires current order/session and creation links';
  END IF;

  CREATE TABLE public.creation_dedications (
    creation_id uuid PRIMARY KEY REFERENCES public.creations(creation_id) ON DELETE CASCADE,
    decision text NOT NULL CHECK (decision IN ('skipped', 'confirmed')),
    body text,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT creation_dedication_body_shape CHECK (
      (decision = 'skipped' AND body IS NULL) OR
      (decision = 'confirmed' AND body IS NOT NULL
        AND char_length(btrim(body, E' \t\n')) >= 1
        AND char_length(body) <= 300
        AND position(E'\r' IN body) = 0
        AND char_length(body) - char_length(replace(body, E'\n', '')) <= 8)
    )
  );

  CREATE TABLE public.cart_item_dedications (
    cart_item_id uuid PRIMARY KEY REFERENCES public.cart_items(cart_item_id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    creation_id uuid NOT NULL REFERENCES public.creations(creation_id) ON DELETE RESTRICT,
    decision text NOT NULL CHECK (decision IN ('skipped', 'confirmed')),
    body text,
    source_revision bigint NOT NULL CHECK (source_revision >= 1),
    captured_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cart_item_dedication_body_shape CHECK (
      (decision = 'skipped' AND body IS NULL) OR
      (decision = 'confirmed' AND body IS NOT NULL
        AND char_length(btrim(body, E' \t\n')) >= 1
        AND char_length(body) <= 300
        AND position(E'\r' IN body) = 0
        AND char_length(body) - char_length(replace(body, E'\n', '')) <= 8)
    )
  );
  CREATE INDEX cart_item_dedications_order_idx
    ON public.cart_item_dedications(order_id, cart_item_id);

  ALTER TABLE public.creation_dedications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.cart_item_dedications ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.creation_dedications, public.cart_item_dedications
    FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.creation_dedications, public.cart_item_dedications TO service_role;

  CREATE FUNCTION public.dedication_guard_snapshot_change()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
  DECLARE
    v_row public.cart_item_dedications%ROWTYPE;
    v_order public.orders%ROWTYPE;
    v_item public.cart_items%ROWTYPE;
  BEGIN
    IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
    SELECT * INTO v_order FROM public.orders WHERE order_id = v_row.order_id;
    IF NOT FOUND OR v_order.order_status::text <> 'unpaid'
       OR v_order.checkout_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Dedication purchase snapshot is locked' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      OLD.cart_item_id IS DISTINCT FROM NEW.cart_item_id OR
      OLD.order_id IS DISTINCT FROM NEW.order_id OR
      OLD.creation_id IS DISTINCT FROM NEW.creation_id
    ) THEN
      RAISE EXCEPTION 'Dedication snapshot identity cannot change' USING ERRCODE = '23514';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT * INTO v_item FROM public.cart_items WHERE cart_item_id = v_row.cart_item_id;
      IF NOT FOUND OR v_item.order_id IS DISTINCT FROM v_row.order_id
         OR v_item.creation_id IS DISTINCT FROM v_row.creation_id
         OR v_item.status::text <> 'ordered' THEN
        RAISE EXCEPTION 'Dedication snapshot must match an ordered cart item'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END $function$;
  CREATE TRIGGER dedication_snapshot_change_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.cart_item_dedications
    FOR EACH ROW EXECUTE FUNCTION public.dedication_guard_snapshot_change();

  CREATE FUNCTION public.dedication_save_creation(
    p_creation_id uuid, p_owner_type text, p_owner_id uuid,
    p_expected_revision bigint, p_decision text, p_body text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
  DECLARE
    v_creation public.creations%ROWTYPE;
    v_row public.creation_dedications%ROWTYPE;
    v_body text;
  BEGIN
    IF p_creation_id IS NULL OR p_owner_id IS NULL
       OR p_owner_type NOT IN ('anon', 'customer')
       OR p_decision NOT IN ('skipped', 'confirmed') THEN
      RAISE EXCEPTION 'Invalid dedication request' USING ERRCODE = '22023';
    END IF;
    -- Lock related unpaid orders before the creation. Session-lock writers
    -- also lock an order row, so an edit and Checkout serialize on that row.
    PERFORM o.order_id FROM public.orders o
      WHERE o.order_status::text = 'unpaid' AND EXISTS (
        SELECT 1 FROM public.cart_items ci
        WHERE ci.order_id = o.order_id AND ci.creation_id = p_creation_id
          AND ci.status::text = 'ordered'
      ) ORDER BY o.order_id FOR UPDATE OF o;
    IF EXISTS (
      SELECT 1 FROM public.orders o WHERE o.order_status::text = 'unpaid'
        AND o.checkout_session_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.cart_items ci
          WHERE ci.order_id = o.order_id AND ci.creation_id = p_creation_id
            AND ci.status::text = 'ordered'
        )
    ) THEN
      RAISE EXCEPTION 'Active checkout must be cancelled before editing dedication'
        USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_creation FROM public.creations
      WHERE creation_id = p_creation_id FOR UPDATE;
    IF NOT FOUND OR v_creation.owner_type::text IS DISTINCT FROM p_owner_type
       OR (p_owner_type = 'customer' AND v_creation.customer_id IS DISTINCT FROM p_owner_id)
       OR (p_owner_type = 'anon' AND v_creation.anon_session_id IS DISTINCT FROM p_owner_id) THEN
      RAISE EXCEPTION 'Dedication creation not owned' USING ERRCODE = '42501';
    END IF;
    v_body := CASE WHEN p_decision = 'skipped' THEN NULL ELSE
      btrim(replace(replace(p_body, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n') END;
    IF p_decision = 'confirmed' AND (
      v_body IS NULL OR char_length(v_body) NOT BETWEEN 1 AND 300 OR
      char_length(v_body) - char_length(replace(v_body, E'\n', '')) > 8
    ) THEN
      RAISE EXCEPTION 'Invalid dedication body' USING ERRCODE = '22023';
    END IF;
    IF p_expected_revision IS NULL THEN
      INSERT INTO public.creation_dedications(creation_id, decision, body)
        VALUES(p_creation_id, p_decision, v_body)
        ON CONFLICT DO NOTHING RETURNING * INTO v_row;
    ELSE
      UPDATE public.creation_dedications SET decision = p_decision,
        body = v_body, revision = revision + 1, updated_at = clock_timestamp()
        WHERE creation_id = p_creation_id AND revision = p_expected_revision
        RETURNING * INTO v_row;
    END IF;
    IF v_row.creation_id IS NULL THEN
      RAISE EXCEPTION 'Dedication changed; reload before saving' USING ERRCODE = '40001';
    END IF;
    RETURN pg_catalog.jsonb_build_object('decision', v_row.decision,
      'body', v_row.body, 'revision', v_row.revision,
      'updatedAt', v_row.updated_at);
  END $function$;

  CREATE FUNCTION public.dedication_prepare_order(
    p_order_id uuid, p_owner_type text, p_owner_id uuid
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
  DECLARE
    v_order public.orders%ROWTYPE;
    v_item public.cart_items%ROWTYPE;
    v_decision public.creation_dedications%ROWTYPE;
    v_count integer := 0;
  BEGIN
    IF p_order_id IS NULL OR p_owner_id IS NULL OR p_owner_type NOT IN ('anon', 'customer') THEN
      RAISE EXCEPTION 'Invalid dedication order request' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_order FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.order_status::text <> 'unpaid'
       OR v_order.checkout_session_id IS NOT NULL
       OR (p_owner_type = 'customer' AND v_order.customer_id IS DISTINCT FROM p_owner_id) THEN
      RAISE EXCEPTION 'Dedication order not payable' USING ERRCODE = '55000';
    END IF;
    -- A line can be returned to the cart while its unpaid order is retained.
    -- Remove only snapshots no longer belonging to an ordered line of this
    -- unlocked order; otherwise the checkout fingerprint sees a stale extra row.
    DELETE FROM public.cart_item_dedications d WHERE d.order_id = p_order_id
      AND NOT EXISTS (
        SELECT 1 FROM public.cart_items ci WHERE ci.cart_item_id = d.cart_item_id
          AND ci.order_id = p_order_id AND ci.status::text = 'ordered'
      );
    FOR v_item IN SELECT * FROM public.cart_items
      WHERE order_id = p_order_id AND status::text = 'ordered'
      ORDER BY cart_item_id FOR UPDATE LOOP
      IF v_item.creation_id IS NULL OR v_item.owner_type::text IS DISTINCT FROM p_owner_type
         OR (p_owner_type = 'customer' AND v_item.customer_id IS DISTINCT FROM p_owner_id)
         OR (p_owner_type = 'anon' AND v_item.anon_session_id IS DISTINCT FROM p_owner_id) THEN
        RAISE EXCEPTION 'Dedication order item owner mismatch' USING ERRCODE = '42501';
      END IF;
      SELECT * INTO v_decision FROM public.creation_dedications
        WHERE creation_id = v_item.creation_id FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Dedication choice required before payment' USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.cart_item_dedications(
        cart_item_id, order_id, creation_id, decision, body, source_revision, captured_at
      ) VALUES (
        v_item.cart_item_id, p_order_id, v_item.creation_id,
        v_decision.decision, v_decision.body, v_decision.revision, clock_timestamp()
      ) ON CONFLICT (cart_item_id) DO UPDATE SET
        decision = EXCLUDED.decision, body = EXCLUDED.body,
        source_revision = EXCLUDED.source_revision, captured_at = EXCLUDED.captured_at;
      v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Dedication order has no payable items' USING ERRCODE = '23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object('itemCount', v_count);
  END $function$;

  REVOKE ALL ON FUNCTION public.dedication_guard_snapshot_change(),
    public.dedication_save_creation(uuid,text,uuid,bigint,text,text),
    public.dedication_prepare_order(uuid,text,uuid)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION
    public.dedication_save_creation(uuid,text,uuid,bigint,text,text),
    public.dedication_prepare_order(uuid,text,uuid) TO service_role;
  NOTIFY pgrst, 'reload schema';
END $dedication_001$;
