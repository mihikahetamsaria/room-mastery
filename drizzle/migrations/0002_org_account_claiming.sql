
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
