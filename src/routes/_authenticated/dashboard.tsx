import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BookingDetailDialog } from "@/components/BookingDetailDialog";
import { PurposeBadge } from "@/components/StatusBadge";
import { formatDate, formatRange, todayISO } from "@/lib/campus";
import { useBookings, venueCodes, type BookingRow } from "@/lib/data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Campus Venue Booking" },
      {
        name: "description",
        content:
          "Your organization's upcoming venue bookings, booking statistics and today's campus schedule.",
      },
      { property: "og:title", content: "Dashboard — Campus Venue Booking" },
      {
        property: "og:description",
        content: "Upcoming bookings, statistics and today's campus schedule.",
      },
    ],
  }),
  component: DashboardPage,
});

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { data: session } = useSession();
  const { data: bookings = [] } = useBookings();
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const today = todayISO();

  const orgId = session?.organization?.id ?? null;

  const mine = useMemo(
    () => bookings.filter((b) => b.organization_id === orgId && b.status === "confirmed"),
    [bookings, orgId],
  );

  const upcoming = useMemo(
    () => mine.filter((b) => b.date >= today).slice(0, 6),
    [mine, today],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const weekEndISO = weekEnd.toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);

    const counts = new Map<string, number>();
    for (const b of mine) {
      for (const code of venueCodes(b)) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const mostUsed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      total: mine.length,
      thisWeek: mine.filter((b) => b.date >= today && b.date <= weekEndISO).length,
      thisMonth: mine.filter((b) => b.date.startsWith(monthPrefix)).length,
      mostUsed: mostUsed ? `${mostUsed[0]} (${mostUsed[1]})` : "—",
    };
  }, [mine, today]);

  const todaysCampus = useMemo(
    () => bookings.filter((b) => b.date === today && b.status === "confirmed"),
    [bookings, today],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session?.isAdmin
            ? "Administrator dashboard"
            : `Welcome, ${session?.organization?.abbreviation ?? ""}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {session?.isAdmin
            ? "Campus-wide visibility over every organization's bookings."
            : session?.organization?.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" value={stats.total} />
        <StatCard label="Next 7 days" value={stats.thisWeek} />
        <StatCard label="This month" value={stats.thisMonth} />
        <StatCard label="Most-used venue" value={stats.mostUsed} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your upcoming bookings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Venue(s)</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No upcoming bookings.
                  </TableCell>
                </TableRow>
              ) : (
                upcoming.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(b.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRange(b.start_time, b.end_time)}
                    </TableCell>
                    <TableCell>{venueCodes(b).join(", ")}</TableCell>
                    <TableCell>
                      <PurposeBadge purpose={b.purpose} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(b)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today across campus</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Venue(s)</TableHead>
                <TableHead>Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todaysCampus.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No bookings scheduled today.
                  </TableCell>
                </TableRow>
              ) : (
                todaysCampus.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold">
                      {b.organizations?.abbreviation}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRange(b.start_time, b.end_time)}
                    </TableCell>
                    <TableCell>{venueCodes(b).join(", ")}</TableCell>
                    <TableCell>
                      <PurposeBadge purpose={b.purpose} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BookingDetailDialog booking={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
