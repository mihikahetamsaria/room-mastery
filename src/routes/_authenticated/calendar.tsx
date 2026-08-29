import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurposeBadge } from "@/components/StatusBadge";
import { BookingDetailDialog } from "@/components/BookingDetailDialog";
import { formatDate, formatRange, toISODate } from "@/lib/campus";
import { useBookings, venueCodes, type BookingRow } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Campus Calendar — PEC Chandigarh" },
      {
        name: "description",
        content:
          "Month-by-month calendar of every confirmed club and society venue booking at Punjab Engineering College, Chandigarh.",
      },
      { property: "og:title", content: "Campus Calendar — PEC Chandigarh" },
      {
        property: "og:description",
        content: "Shared month calendar of all confirmed campus venue bookings.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: bookings = [], isLoading } = useBookings();
  const [selected, setSelected] = useState<Date>(new Date());
  const [detail, setDetail] = useState<BookingRow | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;
      const list = map.get(booking.date) ?? [];
      list.push(booking);
      map.set(booking.date, list);
    }
    return map;
  }, [bookings]);

  const bookedDays = useMemo(
    () =>
      [...byDate.keys()].map((iso) => {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
      }),
    [byDate],
  );

  const selectedISO = toISODate(selected);
  const dayBookings = byDate.get(selectedISO) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campus calendar</h1>
        <p className="text-sm text-muted-foreground">
          Every confirmed booking across all clubs and societies. Dots mark days that
          already have reservations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card className="w-fit">
          <CardContent className="pt-6">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => date && setSelected(date)}
              modifiers={{ booked: bookedDays }}
              modifiersClassNames={{
                booked: "font-semibold underline decoration-primary decoration-2",
              }}
              className={cn("pointer-events-auto p-3")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {formatDate(selectedISO)} · {dayBookings.length} booking
              {dayBookings.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading calendar…</p>
            ) : dayBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No venues are booked on this date — everything is available.
              </p>
            ) : (
              [...dayBookings]
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => setDetail(booking)}
                    className="hover:bg-secondary flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {booking.organizations?.abbreviation} ·{" "}
                        {venueCodes(booking).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRange(booking.start_time, booking.end_time)} ·{" "}
                        {booking.organizations?.name}
                      </p>
                    </div>
                    <PurposeBadge purpose={booking.purpose} />
                  </button>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      <BookingDetailDialog booking={detail} onOpenChange={() => setDetail(null)} />
    </div>
  );
}
