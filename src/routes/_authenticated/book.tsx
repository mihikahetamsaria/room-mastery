import { createFileRoute } from "@tanstack/react-router";

import { BookingForm } from "@/components/BookingForm";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useOrganizations } from "@/lib/data";
import { useSession } from "@/lib/session";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/book")({
  head: () => ({
    meta: [
      { title: "Book a Venue — Campus Venue Booking" },
      {
        name: "description",
        content:
          "Request lecture halls, tutorial rooms or the auditorium. Every request is clash-checked before it is confirmed.",
      },
      { property: "og:title", content: "Book a Venue — Campus Venue Booking" },
      {
        property: "og:description",
        content: "Request campus venues with automatic clash detection.",
      },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { data: session } = useSession();
  const { data: orgs = [] } = useOrganizations();
  const [adminOrg, setAdminOrg] = useState<string>("");

  const organizationId = session?.isAdmin ? adminOrg : (session?.organization?.id ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book a venue</h1>
        <p className="text-sm text-muted-foreground">
          Times are free-form — any hour of the day, including early morning and late
          night, may be requested.
        </p>
      </div>

      {session?.isAdmin ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <Label htmlFor="adminOrg">Book on behalf of</Label>
            <Select value={adminOrg} onValueChange={setAdminOrg}>
              <SelectTrigger id="adminOrg" className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select an organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.abbreviation} — {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {organizationId ? (
        <BookingForm organizationId={organizationId} />
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Select an organization above to create a booking.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
