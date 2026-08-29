import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Organization } from "@/lib/data";

export type SessionInfo = {
  userId: string;
  username: string;
  organization: Organization | null;
  isAdmin: boolean;
};

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<SessionInfo | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;

      const [{ data: org }, { data: roles }] = await Promise.all([
        supabase
          .from("organizations")
          .select("id,name,abbreviation,category")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const username =
        (user.user_metadata?.["username"] as string | undefined) ??
        (org as Organization | null)?.abbreviation ??
        (isAdmin ? "ADMIN" : (user.email ?? "").split("@")[0]?.toUpperCase() ?? "USER");

      return {
        userId: user.id,
        username,
        organization: (org as Organization | null) ?? null,
        isAdmin,
      };
    },
    staleTime: 60 * 1000,
  });
}
