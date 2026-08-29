import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import pecLogo from "@/assets/pec-logo.png";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail } from "@/lib/campus";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PEC Chandigarh Venue Booking — Sign In" },
      {
        name: "description",
        content:
          "Sign in or register your Punjab Engineering College club or society to book lecture halls, tutorial rooms and the Main Auditorium.",
      },
      { property: "og:title", content: "PEC Chandigarh Venue Booking — Sign In" },
      {
        property: "og:description",
        content:
          "Venue booking system for PEC Chandigarh clubs and societies.",
      },
    ],
  }),
  component: LoginPage,
});

type UnclaimedOrg = { name: string; abbreviation: string };

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [unclaimed, setUnclaimed] = useState<UnclaimedOrg[]>([]);
  const [regOrg, setRegOrg] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    supabase.rpc("list_organizations", { _only_unclaimed: false }).then(({ data }) => {
      if (active && data) setUnclaimed(data as UnclaimedOrg[]);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setRegError(null);
    if (regPassword.length < 8) {
      setRegError("Password must be at least 8 characters.");
      return;
    }
    setRegistering(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: usernameToEmail(regOrg),
        password: regPassword,
        options: { data: { username: regOrg.toUpperCase() } },
      });
      if (signUpError) {
        setRegError(
          signUpError.message.toLowerCase().includes("already")
            ? "An account for this organization already exists. Please sign in."
            : signUpError.message,
        );
        return;
      }
      const { data: signedIn } = await supabase.auth.getSession();
      if (!signedIn.session) {
        await supabase.auth.signInWithPassword({
          email: usernameToEmail(regOrg),
          password: regPassword,
        });
      }
      const { error: claimError } = await supabase.rpc("claim_organization", {
        _abbr: regOrg,
      });
      if (claimError) {
        setRegError(claimError.message);
        await supabase.auth.signOut();
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setRegistering(false);
    }
  }


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError("Invalid organization username or password.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <img
            src={pecLogo}
            alt="Punjab Engineering College logo"
            className="h-12 w-auto rounded-sm bg-white p-1.5"
          />
          <div>
            <p className="text-sm font-semibold tracking-wide uppercase">
              Office of Dean of Student Affairs
            </p>
            <p className="text-xs opacity-85">
              Punjab Engineering College (Deemed to be University), Chandigarh
            </p>
          </div>
        </div>
      </header>
      <div className="tricolor-rule" />



      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-4 py-10 md:flex-row md:items-center">
        <section className="flex-1 space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Club &amp; Society Venue Booking
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Reserve PEC lecture halls L20–L31, tutorial rooms T1–T8 and the Main Auditorium.
            Every request is checked against the central schedule before it is confirmed,
            so two organizations can never hold the same room at the same time.
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Shared campus calendar visible to all organizations</li>
            <li>• Instant availability check for any date and time</li>
            <li>• Bookings can be edited or cancelled by the holding organization</li>
          </ul>
        </section>

        <Card className="w-full md:max-w-sm">
          <CardHeader>
            <CardTitle className="text-base">Organization access</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username (abbreviation)</Label>
                    <Input
                      id="username"
                      autoCapitalize="characters"
                      placeholder="e.g. ASME"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput
                      id="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Sign in
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Clubs and societies sign in with their abbreviation (ASME, ACM, IEEE…).
                    Administrators use the credentials issued by the Office of Dean of
                    Student Affairs.
                  </p>

                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="org">Your organization</Label>
                    <Select value={regOrg} onValueChange={setRegOrg}>
                      <SelectTrigger id="org">
                        <SelectValue placeholder="Select your club or society" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {unclaimed.map((org) => (
                          <SelectItem key={org.abbreviation} value={org.abbreviation}>
                            {org.abbreviation} — {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {unclaimed.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Every registered organization already has an account. Contact the
                        Office of Dean of Student Affairs if you need access.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Create password</Label>
                    <PasswordInput
                      id="reg-password"
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                    />
                  </div>
                  {regError ? (
                    <p className="text-sm text-destructive">{regError}</p>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registering || !regOrg}
                  >
                    {registering ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Create account
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    One account per organization. Passwords must be at least 8
                    characters.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

