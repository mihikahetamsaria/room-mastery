REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_conflicts(uuid[], date, time, time, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_booking(uuid, public.booking_purpose, date, time, time, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_booking(uuid, public.booking_purpose, date, time, time, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_conflicts(uuid[], date, time, time, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, public.booking_purpose, date, time, time, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking(uuid, public.booking_purpose, date, time, time, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated, service_role;

-- Public (pre-login) listing of organizations that still need an account
CREATE OR REPLACE FUNCTION public.list_organizations(_only_unclaimed boolean DEFAULT true)
RETURNS TABLE (name text, abbreviation text, category public.org_category)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.name, o.abbreviation, o.category
  FROM public.organizations o
  WHERE (_only_unclaimed = false OR o.auth_user_id IS NULL)
  ORDER BY o.abbreviation;
$$;

-- Link the currently signed-in auth user to an organization record
CREATE OR REPLACE FUNCTION public.claim_organization(_abbr text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO target FROM public.organizations
  WHERE upper(abbreviation) = upper(trim(_abbr));
  IF target.id IS NULL THEN RAISE EXCEPTION 'Unknown organization %', _abbr; END IF;
  IF target.auth_user_id IS NOT NULL AND target.auth_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This organization already has an account';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE auth_user_id = auth.uid() AND id <> target.id) THEN
    RAISE EXCEPTION 'This account is already linked to another organization';
  END IF;

  UPDATE public.organizations SET auth_user_id = auth.uid() WHERE id = target.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'org')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'organization_id', target.id);
END; $$;

-- The very first ADMIN registration becomes the Dean's office admin account
CREATE OR REPLACE FUNCTION public.claim_admin()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'An administrator account already exists';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.list_organizations(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_organization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_organizations(boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_organization(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated, service_role;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS event_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permission_signed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.restore_booking(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE; vids uuid[]; conflicts jsonb;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT (b.organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not allowed to restore this booking';
  END IF;
  IF b.status = 'confirmed' THEN RETURN jsonb_build_object('ok', true); END IF;

  SELECT coalesce(array_agg(venue_id), '{}') INTO vids FROM public.booking_venues WHERE booking_id = _booking_id;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO conflicts
  FROM public.find_conflicts(vids, b.date, b.start_time, b.end_time, _booking_id) c;
  IF jsonb_array_length(conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', conflicts);
  END IF;

  UPDATE public.bookings SET status = 'confirmed' WHERE id = _booking_id;
  RETURN jsonb_build_object('ok', true, 'booking_id', _booking_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_booking(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE owner_org uuid;
BEGIN
  SELECT organization_id INTO owner_org FROM public.bookings WHERE id = _booking_id;
  IF owner_org IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT (owner_org = public.current_org_id() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not allowed to delete this booking';
  END IF;
  DELETE FROM public.booking_venues WHERE booking_id = _booking_id;
  DELETE FROM public.bookings WHERE id = _booking_id;
  RETURN jsonb_build_object('ok', true);
END; $function$;

REVOKE ALL ON FUNCTION public.restore_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_booking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_booking(uuid) TO authenticated, service_role;