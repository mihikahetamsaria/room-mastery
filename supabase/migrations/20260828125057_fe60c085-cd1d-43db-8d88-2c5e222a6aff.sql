
CREATE TYPE public.app_role AS ENUM ('admin','org');
CREATE TYPE public.org_category AS ENUM ('club','society');
CREATE TYPE public.booking_purpose AS ENUM ('GBM','Workshop','Meeting','Seminar','Event','Practice','Other');
CREATE TYPE public.booking_status AS ENUM ('confirmed','cancelled');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text NOT NULL UNIQUE,
  category public.org_category NOT NULL,
  auth_user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'org',
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purpose public.booking_purpose NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_order CHECK (end_time > start_time)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.booking_venues (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, venue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_venues TO authenticated;
GRANT ALL ON public.booking_venues TO service_role;
ALTER TABLE public.booking_venues ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.organizations WHERE auth_user_id = auth.uid();
$$;

-- Policies
CREATE POLICY "orgs readable by signed in users" ON public.organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "venues readable by signed in users" ON public.venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "bookings readable by signed in users" ON public.bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "orgs insert own bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "orgs update own bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "orgs delete own bookings" ON public.bookings FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "booking venues readable" ON public.booking_venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "booking venues writable by owner or admin" ON public.booking_venues FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id
      AND (b.organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id
      AND (b.organization_id = public.current_org_id() OR public.has_role(auth.uid(),'admin'))));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clash detection helper: returns conflicts for a requested slot
CREATE OR REPLACE FUNCTION public.find_conflicts(
  _venue_ids uuid[], _date date, _start time, _end time, _exclude_booking uuid DEFAULT NULL
) RETURNS TABLE (venue_code text, org_abbr text, start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.code, o.abbreviation, b.start_time, b.end_time
  FROM public.bookings b
  JOIN public.booking_venues bv ON bv.booking_id = b.id
  JOIN public.venues v ON v.id = bv.venue_id
  JOIN public.organizations o ON o.id = b.organization_id
  WHERE b.status = 'confirmed'
    AND b.date = _date
    AND bv.venue_id = ANY(_venue_ids)
    AND (_exclude_booking IS NULL OR b.id <> _exclude_booking)
    AND _start < b.end_time AND _end > b.start_time
  ORDER BY v.code, b.start_time;
$$;

-- Transactional, permission-checked booking creation
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

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_org uuid;
BEGIN
  SELECT organization_id INTO owner_org FROM public.bookings WHERE id = _booking_id;
  IF owner_org IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT (owner_org = public.current_org_id() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not allowed to cancel this booking';
  END IF;
  UPDATE public.bookings SET status='cancelled' WHERE id=_booking_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.create_booking(uuid, public.booking_purpose, date, time, time, uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.update_booking(uuid, public.booking_purpose, date, time, time, uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, public.booking_purpose, date, time, time, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking(uuid, public.booking_purpose, date, time, time, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_conflicts(uuid[], date, time, time, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;

-- Seed venues
INSERT INTO public.venues (code, label, sort_order)
SELECT 'L'||g, 'Lecture Hall L'||g, g FROM generate_series(20,31) g;
INSERT INTO public.venues (code, label, sort_order)
SELECT 'T'||g, 'Tutorial Room T'||g, 100+g FROM generate_series(1,8) g;
INSERT INTO public.venues (code, label, sort_order) VALUES ('Auditorium','Main Auditorium',200);

-- Seed organizations
INSERT INTO public.organizations (name, abbreviation, category) VALUES
('Robotics Club','ROBOTICS','society'),
('American Society of Mechanical Engineers','ASME','society'),
('Society of Manufacturing Engineers','SME','society'),
('Association of Society of Product Scientists','ASPS','society'),
('Institute of Electrical and Electronics Engineers','IEEE','society'),
('Environmental Society','ES','society'),
('Society of Automotive Engineers','SAE','society'),
('Aero Technical Society','ATS','society'),
('Indian Geotechnical Society','IGS','society'),
('Indian Institute of Metals','IIM','society'),
('Solar Energy Society of India','SESI','society'),
('American Society of Civil Engineers','ASCE','society'),
('Association for Computing Machinery','ACM','society'),
('Speakers’ Association And Study Circle','SAASC','club'),
('Art and Photography Club','APC','club'),
('Projection Design Club','PDC','club'),
('Rotaract Club','ROTARACT','club'),
('English Editorial Board','EEB','club'),
('Hindi Editorial Board','HEB','club'),
('Punjabi Editorial Board','PEB','club'),
('Electoral Literary Club','ELC','club'),
('Entrepreneurship and Incubation Cell','EIC','club'),
('Student Counselling Cell','SCC','club'),
('Women Empowerment Cell','WEC','club'),
('Communication, Information and Media Cell','CIM','club'),
('National Cadet Corps','NCC','club'),
('National Service Scheme','NSS','club');

-- Seed bookings
DO $seed$
DECLARE
  b uuid;
  d0 date := CURRENT_DATE;
  fn_org text; 
BEGIN
  -- helper inline inserts
  -- 1) ASME holds L21 today 14:00-16:00 (intentional near-clash target)
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Workshop', d0+1, '14:00','16:00' FROM public.organizations WHERE abbreviation='ASME' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L21';

  -- 2) IEEE holds Auditorium tomorrow 10:00-12:30 (clash target)
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Seminar', d0+1, '10:00','12:30' FROM public.organizations WHERE abbreviation='IEEE' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='Auditorium';

  -- 3) Adjacent booking in L21 right after ASME (allowed)
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'GBM', d0+1, '16:00','17:30' FROM public.organizations WHERE abbreviation='ACM' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L21';

  -- 4) Multi-venue booking: NSS across L24, L25, T3
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Event', d0+2, '09:00','13:00' FROM public.organizations WHERE abbreviation='NSS' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code IN ('L24','L25','T3');

  -- 5) Multi-venue booking: ROBOTICS across T1, T2
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Practice', d0+3, '18:30','21:00' FROM public.organizations WHERE abbreviation='ROBOTICS' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code IN ('T1','T2');

  -- 6) Late night slot
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Meeting', d0+2, '22:00','23:30' FROM public.organizations WHERE abbreviation='EIC' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L28';

  -- 7) Early morning slot
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Practice', d0+2, '05:30','07:00' FROM public.organizations WHERE abbreviation='NCC' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L20';

  -- 8) Past booking
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Seminar', d0-5, '11:00','13:00' FROM public.organizations WHERE abbreviation='ASCE' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L30';

  -- 9) Cancelled booking in L22 tomorrow 14:00-16:00 (does not block)
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time, status)
  SELECT id,'Workshop', d0+1, '14:00','16:00','cancelled' FROM public.organizations WHERE abbreviation='SAE' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L22';

  -- 10) Assorted
  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'GBM', d0+4, '15:00','16:00' FROM public.organizations WHERE abbreviation='WEC' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='T5';

  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Workshop', d0, '13:00','15:00' FROM public.organizations WHERE abbreviation='SME' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='L26';

  INSERT INTO public.bookings (organization_id, purpose, date, start_time, end_time)
  SELECT id,'Meeting', d0, '17:00','18:00' FROM public.organizations WHERE abbreviation='PDC' RETURNING id INTO b;
  INSERT INTO public.booking_venues SELECT b, id FROM public.venues WHERE code='T7';
END $seed$;
