import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";

import pecLogo from "@/assets/pec-logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/book", label: "Book a Venue" },
  { to: "/availability", label: "Availability" },
  { to: "/calendar", label: "Calendar" },
  { to: "/my-bookings", label: "My Bookings" },
  { to: "/account", label: "Account" },
] as const;

function AppShell() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const links = session?.isAdmin
    ? [...NAV, { to: "/all-bookings", label: "Admin Console" } as const]
    : NAV;


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={pecLogo}
              alt="Punjab Engineering College logo"
              className="h-9 w-auto shrink-0 rounded-sm bg-white p-1"
            />

            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide uppercase">
                Punjab Engineering College
              </p>
              <p className="text-xs opacity-80">
                {session?.isAdmin
                  ? "Dean of Student Affairs (Admin)"
                  : (session?.organization?.name ?? "Organization portal")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded border border-primary-foreground/30 px-2 py-1 text-xs font-semibold sm:inline">
              {session?.username}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="hover:bg-primary-foreground/10 hidden sm:inline-flex"
              onClick={signOut}
            >
              <LogOut className="mr-1 size-4" /> Logout
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="hover:bg-primary-foreground/10 md:hidden"
              aria-label="Toggle navigation"
              onClick={() => setOpen((v) => !v)}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
        <div className="tricolor-rule" />


        <nav
          className={cn(
            "border-t border-primary-foreground/15 bg-primary/95",
            open ? "block" : "hidden md:block",
          )}
        >
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-2 py-2 text-sm md:flex-row md:items-center">
            {links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setOpen(false)}
                  activeProps={{ className: "bg-primary-foreground/15 font-semibold" }}
                  className="hover:bg-primary-foreground/10 block rounded px-3 py-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="md:hidden">
              <button
                onClick={signOut}
                className="hover:bg-primary-foreground/10 block w-full rounded px-3 py-2 text-left"
              >
                Logout
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Punjab Engineering College (Deemed to be University), Chandigarh · Office of Dean of Student Affairs
      </footer>
    </div>
  );
}
