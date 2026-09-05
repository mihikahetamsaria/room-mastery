import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { BookingDetailDialog } from "@/components/BookingDetailDialog";
import { BookingForm } from "@/components/BookingForm";
import { PurposeBadge, StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatRange, todayISO, toHHMM } from "@/lib/campus";
import {
  useBookings,
  useOrganizations,
  venueCodes,
  type BookingRow,
} from "@/lib/data";
import {
  cancelBookingFn,
  deleteBookingFn,
  restoreBookingFn,
  setBookingFlagsFn,
} from "@/lib/booking.functions";

export function BookingsManager({
  scope,
  organizationId,
}: {
  scope: "own" | "all";
  organizationId?: string | null;
}) {
  const { data: bookings = [], isLoading } = useBookings();
  const { data: orgs = [] } = useOrganizations();
  const queryClient = useQueryClient();
  const cancel = useServerFn(cancelBookingFn);
  const setFlags = useServerFn(setBookingFlagsFn);
  const restore = useServerFn(restoreBookingFn);
  const remove = useServerFn(deleteBookingFn);

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const [editing, setEditing] = useState<BookingRow | null>(null);

  const today = todayISO();

  const rows = useMemo(() => {
    return bookings
      .filter((b) =>
        scope === "own" ? b.organization_id === organizationId : true,
      )
      .filter((b) =>
        orgFilter === "all" ? true : b.organization_id === orgFilter,
      )
      .filter((b) =>
        tab === "upcoming" ? b.date >= today : b.date < today,
      )
      .sort((a, b) =>
        tab === "upcoming"
          ? `${a.date}${a.start_time}`.localeCompare(
              `${b.date}${b.start_time}`,
            )
          : `${b.date}${b.start_time}`.localeCompare(
              `${a.date}${a.start_time}`,
            ),
      );
  }, [bookings, scope, organizationId, orgFilter, tab, today]);

  async function handleCancel(booking: BookingRow) {
    if (
      !window.confirm(
        `Cancel this booking? The venue will be freed immediately.`,
      )
    ) {
      return;
    }

    try {
      await cancel({ data: { bookingId: booking.id } });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Booking cancelled — venue is now free.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not cancel booking.",
      );
    }
  }

  async function handleRestore(booking: BookingRow) {
    try {
      const result = await restore({ data: { bookingId: booking.id } });

      if (!result.ok) {
        const list = (result.conflicts ?? [])
          .map(
            (c) =>
              `${c.venue_code} — ${c.org_abbr} ${c.start_time}–${c.end_time}`,
          )
          .join("; ");

        toast.error(`Cannot restore: slot already taken (${list})`);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Booking restored — it is confirmed again.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not restore booking.",
      );
    }
  }

  async function handleDelete(booking: BookingRow) {
    if (
      !window.confirm(
        "Delete this booking permanently? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await remove({ data: { bookingId: booking.id } });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Booking deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete booking.",
      );
    }
  }

  function exportCsv() {
    const header = [
      "Organization",
      "Date",
      "Start",
      "End",
      "Venues",
      "Purpose",
      "Status",
      "Event done",
      "Permission signed",
    ];

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const lines = [
      header.join(","),
      ...rows.map((b) =>
        [
          b.organizations?.abbreviation ?? "",
          b.date,
          toHHMM(b.start_time),
          toHHMM(b.end_time),
          venueCodes(b).join(" / "),
          b.purpose === "Other" && b.custom_purpose?.trim()
            ? b.custom_purpose.trim()
            : b.purpose,
          b.status,
          b.event_done ? "yes" : "no",
          b.permission_signed ? "yes" : "no",
        ]
          .map((v) => escape(String(v)))
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pec-bookings-${tab}-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exported.");
  }

  async function handleFlag(
    booking: BookingRow,
    field: "eventDone" | "permissionSigned",
    value: boolean,
  ) {
    try {
      await setFlags({
        data: {
          bookingId: booking.id,
          [field]: value,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: ["bookings"],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update booking.",
      );
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">
          {scope === "own"
            ? "My bookings"
            : "All bookings across campus"}
        </CardTitle>

        <div className="flex flex-wrap items-center gap-3">
          {scope === "all" ? (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All organizations
                </SelectItem>

                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.abbreviation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={(v) =>
              setTab(v as "upcoming" | "past")
            }
          >
            <TabsList>
              <TabsTrigger value="upcoming">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="past">
                Past
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {scope === "all" ? <TableHead>Org</TableHead> : null}
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Venue(s)</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">
                  Event done
                </TableHead>
                <TableHead className="text-center">
                  Permission signed
                </TableHead>
                <TableHead className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground"
                  >
                    Loading bookings…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground"
                  >
                    No {tab} bookings.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((b) => (
                  <TableRow key={b.id}>
                    {scope === "all" ? (
                      <TableCell className="font-semibold">
                        {b.organizations?.abbreviation}
                      </TableCell>
                    ) : null}

                    <TableCell className="whitespace-nowrap">
                      {formatDate(b.date)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {formatRange(
                        b.start_time,
                        b.end_time,
                      )}
                    </TableCell>

                    <TableCell>
                      {venueCodes(b).join(", ")}
                    </TableCell>

                    <TableCell>
                      <PurposeBadge
                        purpose={
                          b.purpose === "Other" &&
                          b.custom_purpose?.trim()
                            ? b.custom_purpose.trim()
                            : b.purpose
                        }
                      />
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>

                    <TableCell className="text-center">
                      <Checkbox
                        checked={b.event_done}
                        aria-label="Event completed"
                        disabled={b.status !== "confirmed"}
                        onCheckedChange={(v) =>
                          handleFlag(
                            b,
                            "eventDone",
                            v === true,
                          )
                        }
                      />
                    </TableCell>

                    <TableCell className="text-center">
                      <Checkbox
                        checked={b.permission_signed}
                        aria-label="Room permission signed and submitted"
                        disabled={b.status !== "confirmed"}
                        onCheckedChange={(v) =>
                          handleFlag(
                            b,
                            "permissionSigned",
                            v === true,
                          )
                        }
                      />
                    </TableCell>

                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetail(b)}
                      >
                        View
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(b)}
                      >
                        Edit
                      </Button>

                      {b.status === "confirmed" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCancel(b)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(b)}
                        >
                          Restore
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(b)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <BookingDetailDialog
        booking={detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit booking — {editing?.organizations?.abbreviation}
            </DialogTitle>
          </DialogHeader>

          {editing ? (
            <BookingForm
              embedded
              organizationId={editing.organization_id}
              bookingId={editing.id}
              submitLabel="Save changes"
              initial={{
                purpose: editing.purpose,
                customPurpose: editing.custom_purpose ?? "",
                date: editing.date,
                start: toHHMM(editing.start_time),
                end: toHHMM(editing.end_time),
                venueIds: editing.booking_venues
                  .map((bv) => bv.venues?.id)
                  .filter(
                    (id): id is string => Boolean(id),
                  ),
              }}
              onSuccess={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
