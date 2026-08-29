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