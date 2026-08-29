ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;

-- Additional rooms (existing rooms are untouched)
INSERT INTO public.venues (code, label, sort_order, restricted) VALUES
  ('L1','Lecture Hall L1',1,true),
  ('L2','Lecture Hall L2',2,true),
  ('L3','Lecture Hall L3',3,true),
  ('L8','Lecture Hall L8',8,true),
  ('L9','Lecture Hall L9',9,true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.venue_access (
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id, organization_id)
);
GRANT SELECT ON public.venue_access TO authenticated;
GRANT ALL ON public.venue_access TO service_role;
ALTER TABLE public.venue_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue access readable by signed in users" ON public.venue_access
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.venue_access (venue_id, organization_id)
SELECT v.id, o.id
FROM public.venues v
CROSS JOIN public.organizations o
WHERE v.code IN ('L1','L2','L3','L8','L9')
  AND o.abbreviation IN ('NCC','NSS')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.org_can_book(_organization_id uuid, _venue_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = ANY(_venue_ids)
      AND v.restricted
      AND NOT EXISTS (
        SELECT 1 FROM public.venue_access va
        WHERE va.venue_id = v.id AND va.organization_id = _organization_id
      )
  );
$$;
REVOKE ALL ON FUNCTION public.org_can_book(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_can_book(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_booking(
  _organization_id uuid, _purpose public.booking_purpose, _date date,
  _start time, _end time, _venue_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conflicts jsonb; new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'You can only create bookings for your own organization';
  END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  IF _venue_ids IS NULL OR array_length(_venue_ids,1) IS NULL THEN RAISE EXCEPTION 'Select at least one venue'; END IF;
  IF NOT public.org_can_book(_organization_id, _venue_ids) THEN
    RAISE EXCEPTION 'This organization is not allowed to book one of the selected rooms';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO conflicts
  FROM public.find_conflicts(_venue_ids,_date,_start,_end,NULL) c;
  IF jsonb_array_length(conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', conflicts);
  END IF;

  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  VALUES (_organization_id,_purpose,_date,_start,_end) RETURNING id INTO new_id;
  INSERT INTO public.booking_venues (booking_id, venue_id)
  SELECT new_id, unnest(_venue_ids);
  RETURN jsonb_build_object('ok', true, 'booking_id', new_id);
END; $$;

CREATE OR REPLACE FUNCTION public.update_booking(
  _booking_id uuid, _purpose public.booking_purpose, _date date,
  _start time, _end time, _venue_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conflicts jsonb; owner_org uuid;
BEGIN
  SELECT organization_id INTO owner_org FROM public.bookings WHERE id = _booking_id;
  IF owner_org IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT (owner_org = public.current_org_id() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not allowed to edit this booking';
  END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  IF NOT public.org_can_book(owner_org, _venue_ids) THEN
    RAISE EXCEPTION 'This organization is not allowed to book one of the selected rooms';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO conflicts
  FROM public.find_conflicts(_venue_ids,_date,_start,_end,_booking_id) c;
  IF jsonb_array_length(conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', conflicts);
  END IF;

  UPDATE public.bookings SET purpose=_purpose, date=_date, start_time=_start, end_time=_end
  WHERE id=_booking_id;
  DELETE FROM public.booking_venues WHERE booking_id = _booking_id;
  INSERT INTO public.booking_venues (booking_id, venue_id) SELECT _booking_id, unnest(_venue_ids);
  RETURN jsonb_build_object('ok', true, 'booking_id', _booking_id);
END; $$;

-- Login details for organisation accounts, readable only by the administrator
CREATE TABLE public.org_credentials (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_credentials TO authenticated;
GRANT ALL ON public.org_credentials TO service_role;
ALTER TABLE public.org_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "only admins read org credentials" ON public.org_credentials
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));