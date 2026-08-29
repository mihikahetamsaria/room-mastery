import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatRange, todayISO } from "@/lib/campus";
import { useBookings, useVenues, venueCodes, type BookingRow } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/availability")({
  head: () => ({
    meta: [
      { title: "Venue Availability — PEC Chandigarh" },
      {
        name: "description",
        content:
          "Check which lecture halls, tutorial rooms and the auditorium at Punjab Engineering College are free for a given date and time slot.",
      },
      { property: "og:title", content: "Venue Availability — PEC Chandigarh" },
      {
        property: "og:description",
        content: "Live free/busy view of every campus venue for any date and time slot.",
      },
    ],
  }),
  component: AvailabilityPage,
});

function overlaps(booking: BookingRow, start: string, end: string) {
  return start < booking.end_time.slice(0, 5) && end > booking.start_time.slice(0, 5);
}

function AvailabilityPage() {
  const { data: venues = [] } = useVenues();
  const { data: bookings = [], isLoading } = useBookings();

  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");

  const validRange = end > start;

  const rows = useMemo(() => {
    const dayBookings = bookings.filter(
      (b) => b.date === date && b.status === "confirmed",
    );
    return venues.map((venue) => {
      const clashes = dayBookings.filter(
        (b) => venueCodes(b).includes(venue.code) && overlaps(b, start, end),
      );
      const rest = dayBookings.filter(
        (b) => venueCodes(b).includes(venue.code) && !overlaps(b, start, end),
      );
      return { venue, clashes, rest };
    });
  }, [venues, bookings, date, start, end]);

  const freeCount = rows.filter((r) => r.clashes.length === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Venue availability</h1>
        <p className="text-sm text-muted-foreground">
          Pick a date and a time slot to see every venue that is free right now.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="av-date">Date</Label>
            <Input
              id="av-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="av-start">From</Label>
            <Input
              id="av-start"
              type="time"
              step={60}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="av-end">To</Label>
            <Input
              id="av-end"
              type="time"
              step={60}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {!validRange ? (
        <p className="text-sm text-destructive">End time must be after start time.</p>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {formatRange(start, end)} · {freeCount} of {rows.length} venues free
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading schedule…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ venue, clashes, rest }) => {
                  const free = clashes.length === 0;
                  return (
                    <div
                      key={venue.id}
                      className={cn(
                        "rounded-md border p-3",
                        free
                          ? "border-border bg-card"
                          : "border-destructive/40 bg-destructive/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{venue.code}</p>
                          <p className="text-xs text-muted-foreground">{venue.label}</p>
                        </div>
                        {free ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="size-3" /> Free
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="size-3" /> Booked
                          </Badge>
                        )}
                      </div>

                      {clashes.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-destructive">
                          {clashes.map((b) => (
                            <li key={b.id}>
                              {b.organizations?.abbreviation} ·{" "}
                              {formatRange(b.start_time, b.end_time)}
                            </li>
                          ))}
                        </ul>
                      ) : rest.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {rest.map((b) => (
                            <li key={b.id}>
                              Also booked {formatRange(b.start_time, b.end_time)} (
                              {b.organizations?.abbreviation})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No bookings on this date.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
