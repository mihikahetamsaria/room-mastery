import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { BookingsManager } from "@/components/BookingsManager";
import { BookingForm } from "@/components/BookingForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO } from "@/lib/campus";
import { useBookings, useOrganizations } from "@/lib/data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/all-bookings")({
  head: () => ({
    meta: [
      { title: "Admin Console — PEC Venue Booking" },
      {
        name: "description",
        content:
          "Administrator console for PEC Chandigarh: view every club booking, track completed events and signed room permissions, and manage reservations.",
      },
      { property: "og:title", content: "Admin Console — PEC Venue Booking" },
      {
        property: "og:description",
        content:
          "Cross-organization booking control for the Dean of Student Activities office.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminConsolePage,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function AdminConsolePage() {
  const { data: session, isLoading } = useSession();
  const { data: bookings = [] } = useBookings();
  const { data: orgs = [] } = useOrganizations();
  const [newFor, setNewFor] = useState<string>("");
  const [open, setOpen] = useState(false);

  const today = todayISO();
  const stats = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === "confirmed");
    return {
      total: confirmed.length,
      upcoming: confirmed.filter((b) => b.date >= today).length,
      cancelled: bookings.length - confirmed.length,
      done: confirmed.filter((b) => b.event_done).length,
      pendingPermission: confirmed.filter((b) => !b.permission_signed).length,
      clubs: new Set(confirmed.map((b) => b.organization_id)).size,
    };
  }, [bookings, today]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!session?.isAdmin) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          This view is restricted to administrator accounts.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
          <p className="text-sm text-muted-foreground">
            Every club and society booking on campus — edit, cancel, book on behalf of a club, and
            track whether the event was held and the room permission was signed.
          </p>
        </div>
        <Button
          onClick={() => {
            setNewFor(orgs[0]?.id ?? "");
            setOpen(true);
          }}
        >
          Book for a club
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Confirmed bookings" value={stats.total} />
        <Stat label="Upcoming" value={stats.upcoming} />
        <Stat label="Cancelled" value={stats.cancelled} />
        <Stat label="Events marked done" value={stats.done} />
        <Stat label="Permission pending" value={stats.pendingPermission} />
        <Stat label="Active clubs" value={stats.clubs} />
      </div>

      <BookingsManager scope="all" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New booking on behalf of a club</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Organization</p>
              <Select value={newFor} onValueChange={setNewFor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.abbreviation} — {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newFor ? (
              <BookingForm
                embedded
                key={newFor}
                organizationId={newFor}
                submitLabel="Create booking"
                onSuccess={() => setOpen(false)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
