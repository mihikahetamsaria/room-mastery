
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
