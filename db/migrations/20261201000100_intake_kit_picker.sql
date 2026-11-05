-- migrate:up

-- D-109: the Kit button of a /new draft opens a picker (one Telegram button per enabled kit)
-- instead of cycling to the next kit. telegram_intake_options() lists the choices for the picker
-- and telegram_intake_pick() applies the one tapped. Both share the draft guards of
-- telegram_intake_cycle() (approver, token, PENDING, expiry), and a pick normalizes the brief the
-- same way, so the cast follows the kit's language (brief_pair_language, D-092).
-- telegram_intake_cycle() is unchanged: the Nhân vật / Worker / Thời lượng buttons still cycle.
--
-- Rollback: drops both functions; WF-06 of the previous version only calls the cycle.

-- The enabled options of one kind in catalog order, with the draft's current choice marked:
-- [{"slug", "label", "current"}, …]. Casts are limited to the kit's language like
-- catalog_selection().
CREATE FUNCTION telegram_intake_options(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, options jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_current text;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::jsonb;
    RETURN;
  END IF;
  v_current := coalesce(v_draft.brief->>p_kind, catalog_default(p_kind));
  RETURN QUERY
    SELECT 'DRAFT'::text,
           coalesce(jsonb_agg(jsonb_build_object('slug', o.slug, 'label', o.label,
                                                 'current', o.slug = v_current)
                              ORDER BY o.sort_order, o.slug), '[]'::jsonb)
    FROM catalog_option o
    WHERE o.kind = p_kind AND o.enabled
      AND (o.kind = 'kit'
           OR o.language = kit_language(coalesce(v_draft.brief->>'kit', catalog_default('kit'))));
END;
$$;

-- Sets one choice of a pending draft. Same rows as telegram_intake_cycle(): DRAFT with the new
-- selection, UNCHANGED when the tapped option is already the current one (Telegram refuses an
-- edit into the same text), INVALID for an unknown or disabled slug (brief_normalize's message).
CREATE FUNCTION telegram_intake_pick(p_token text, p_user_id bigint, p_kind text, p_slug text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_brief jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(p_slug)));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  IF v_brief = v_draft.brief THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_intake_pick(text, bigint, text, text);
DROP FUNCTION telegram_intake_options(text, bigint, text);
